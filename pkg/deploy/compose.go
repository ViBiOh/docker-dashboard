package deploy

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/ViBiOh/auth/pkg/auth"
	"github.com/ViBiOh/auth/pkg/model"
	"github.com/ViBiOh/dashboard/pkg/commons"
	"github.com/ViBiOh/dashboard/pkg/docker"
	"github.com/ViBiOh/httputils/pkg/errors"
	"github.com/ViBiOh/httputils/pkg/httperror"
	"github.com/ViBiOh/httputils/pkg/httpjson"
	"github.com/ViBiOh/httputils/pkg/logger"
	"github.com/ViBiOh/httputils/pkg/request"
	"github.com/ViBiOh/httputils/pkg/tools"
	"github.com/ViBiOh/mailer/pkg/client"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/filters"
	opentracing "github.com/opentracing/opentracing-go"
	yaml "gopkg.in/yaml.v2"
)

const (
	// DeployTimeout indicates delay for application to deploy before rollback
	DeployTimeout = 3 * time.Minute

	defaultCPUShares = 128
	minMemory        = 16777216
	maxMemory        = 805306368
	colonSeparator   = ":"
	deploySuffix     = "_deploy"
)

// Config of package
type Config struct {
	network       *string
	tag           *string
	containerUser *string
	appURL        *string
	notification  *string
}

// App of package
type App struct {
	tasks         sync.Map
	dockerApp     *docker.App
	mailerApp     *client.App
	network       string
	tag           string
	containerUser string
	appURL        string
	notification  string
}

// Flags adds flags for configuring package
func Flags(fs *flag.FlagSet, prefix string) Config {
	return Config{
		network:       fs.String(tools.ToCamel(fmt.Sprintf("%sNetwork", prefix)), "traefik", "[deploy] Default Network"),
		tag:           fs.String(tools.ToCamel(fmt.Sprintf("%sTag", prefix)), "latest", "[deploy] Default image tag)"),
		containerUser: fs.String(tools.ToCamel(fmt.Sprintf("%sContainerUser", prefix)), "1000", "[deploy] Default container user"),
		appURL:        fs.String(tools.ToCamel(fmt.Sprintf("%sAppURL", prefix)), "https://dashboard.vibioh.fr", "[deploy] Application web URL"),
		notification:  fs.String(tools.ToCamel(fmt.Sprintf("%sNotification", prefix)), "onError", "[deploy] Send email notification when deploy ends (possibles values ares 'never', 'onError', 'all')"),
	}
}

// New creates new App from Config
func New(config Config, dockerApp *docker.App, mailerApp *client.App) *App {
	return &App{
		tasks:         sync.Map{},
		dockerApp:     dockerApp,
		mailerApp:     mailerApp,
		network:       *config.network,
		tag:           *config.tag,
		containerUser: *config.containerUser,
		appURL:        *config.appURL,
		notification:  *config.notification,
	}
}

// CanBeGracefullyClosed indicates if application can terminate safely
func (a *App) CanBeGracefullyClosed() (canBe bool) {
	canBe = true

	a.tasks.Range(func(_ interface{}, value interface{}) bool {
		canBe = !value.(bool)
		return canBe
	})

	return
}

func (a *App) pullImage(ctx context.Context, image string) error {
	if !strings.Contains(image, colonSeparator) {
		image = fmt.Sprintf("%s%slatest", image, colonSeparator)
	}

	pull, err := a.dockerApp.Docker.ImagePull(ctx, image, types.ImagePullOptions{})
	if err != nil {
		return errors.WithStack(err)
	}

	_, err = request.ReadBody(pull)
	return err
}

func (a *App) cleanContainers(ctx context.Context, containers []types.Container) error {
	for _, container := range containers {
		if _, err := a.dockerApp.GracefulStopContainer(ctx, container.ID, time.Minute); err != nil {
			logger.Error("cannot stop container %s: %+v", container.Names, err)
		}
	}

	for _, container := range containers {
		if _, err := a.dockerApp.RmContainer(ctx, container.ID, nil, false); err != nil {
			return err
		}
	}

	return nil
}

func (a *App) renameDeployedContainers(ctx context.Context, services map[string]*deployedService) error {
	for _, service := range services {
		if err := a.dockerApp.Docker.ContainerRename(ctx, service.ContainerID, getFinalName(service.FullName)); err != nil {
			return errors.New("cannot rename container %s: %v", service.Name, err)
		}
	}

	return nil
}

func (a *App) deleteServices(ctx context.Context, appName string, services map[string]*deployedService, user *model.User) {
	for _, service := range services {
		infos, err := a.dockerApp.InspectContainer(ctx, service.ContainerID)
		if err != nil {
			logger.Error("user=%s, app=%s, service=%s %+v", user.Username, appName, service.Name, err)
		} else {
			if _, err := a.dockerApp.StopContainer(ctx, service.ContainerID, infos); err != nil {
				logger.Error("user=%s, app=%s service=%s %+v", user.Username, appName, service.Name, err)
			}

			if _, err := a.dockerApp.RmContainer(ctx, service.ContainerID, infos, true); err != nil {
				logger.Error("user=%s, app=%s service=%s %+v", user.Username, appName, service.Name, err)
			}
		}
	}
}

func (a *App) startServices(ctx context.Context, services map[string]*deployedService) error {
	for _, service := range services {
		if _, err := a.dockerApp.StartContainer(ctx, service.ContainerID, nil); err != nil {
			return err
		}
	}

	return nil
}

func (a *App) inspectServices(ctx context.Context, services map[string]*deployedService, user *model.User, appName string) []*types.ContainerJSON {
	containers := make([]*types.ContainerJSON, 0, len(services))

	for _, service := range services {
		infos, err := a.dockerApp.InspectContainer(ctx, service.ContainerID)
		if err != nil {
			logger.Error("user=%s, app=%s service=%s %+v", user.Username, appName, service.Name, err)
		} else {
			containers = append(containers, infos)
		}
	}

	return containers
}

func (a *App) areContainersHealthy(ctx context.Context, user *model.User, appName string, services map[string]*deployedService) bool {
	containersServices := a.inspectServices(ctx, services, user, appName)
	containersIdsWithHealthcheck := commons.GetContainersIDs(commons.FilterContainers(containersServices, hasHealthcheck))

	if len(containersIdsWithHealthcheck) == 0 {
		return true
	}

	for _, id := range containersIdsWithHealthcheck {
		if service := findServiceByContainerID(services, id); service != nil {
			service.State = "unhealthy"
		}
	}

	filtersArgs := filters.NewArgs()
	healthyStatusFilters(&filtersArgs, containersIdsWithHealthcheck)

	timeoutCtx, cancel := context.WithTimeout(ctx, DeployTimeout)
	defer cancel()

	messages, errs := a.dockerApp.Docker.Events(timeoutCtx, types.EventsOptions{Filters: filtersArgs})
	healthyContainers := make(map[string]bool, len(containersIdsWithHealthcheck))

	for {
		select {
		case <-timeoutCtx.Done():
			return false
		case message := <-messages:
			if service := findServiceByContainerID(services, message.ID); service != nil {
				service.State = "healthy"
			}

			healthyContainers[message.ID] = true
			if len(healthyContainers) == len(containersIdsWithHealthcheck) {
				return true
			}
		case err := <-errs:
			logger.Error("user=%s, app=%s %+v", user.Username, appName, errors.WithStack(err))
			return false
		}
	}
}

func (a *App) finishDeploy(ctx context.Context, user *model.User, appName string, services map[string]*deployedService, oldContainers []types.Container, requestParams url.Values) {
	defer func() {
		defer a.tasks.Delete(appName)
	}()

	if span := opentracing.SpanFromContext(ctx); span != nil {
		span.SetTag("app", appName)
		span.SetTag("services_count", len(services))
		defer func() {
			defer span.Finish()
		}()
	}

	success := a.areContainersHealthy(ctx, user, appName, services)
	a.captureServicesOutput(ctx, user, appName, services)

	if success {
		logger.Info("user=%s, app=%s Successful deploy", user.Username, appName)

		if err := a.cleanContainers(ctx, oldContainers); err != nil {
			logger.Error("user=%s, app=%s %+v", user.Username, appName, err)
		}

		if err := a.renameDeployedContainers(ctx, services); err != nil {
			logger.Error("user=%s, app=%s %+v", user.Username, appName, err)
		}
	} else {
		logger.Warn("user=%s, app=%s %v", user.Username, appName, errHealthCheckFailed)
		a.captureServicesHealth(ctx, user, appName, services)
		a.deleteServices(ctx, appName, services, user)
	}

	if !success {
		for _, service := range services {
			logger.Info("user=%s, app=%s logs for %s: \n%s\n", user.Username, appName, service.Name, strings.Join(service.Logs, "\n"))
			logger.Info("user=%s, app=%s health logs for %s: \n%s\n", user.Username, appName, service.Name, strings.Join(service.HealthLogs, "\n"))
		}
	}

	if err := a.sendEmailNotification(ctx, user, appName, services, success); err != nil {
		logger.Error("user=%s, app=%s %+v", user.Username, appName, err)
	}

	if err := a.sendRollbarNotification(ctx, user, requestParams); err != nil {
		logger.Error("user=%s, app=%s %+v", user.Username, appName, err)
	}
}

func (a *App) createContainer(ctx context.Context, user *model.User, appName string, serviceName string, service *dockerComposeService) (*deployedService, error) {
	imagePulled := false

	if a.tag != "" {
		imageOverride := fmt.Sprintf("%s%s%s", service.Image, colonSeparator, a.tag)
		if err := a.pullImage(ctx, imageOverride); err == nil {
			service.Image = imageOverride
			imagePulled = true
		}
	}

	if !imagePulled {
		if err := a.pullImage(ctx, service.Image); err != nil {
			return nil, err
		}
	}

	serviceFullName := getServiceFullName(appName, serviceName)

	config, err := a.getConfig(service, user, appName)
	if err != nil {
		return nil, err
	}

	createdContainer, err := a.dockerApp.Docker.ContainerCreate(ctx, config, a.getHostConfig(service, user), a.getNetworkConfig(serviceName, service), serviceFullName)
	if err != nil {
		return nil, errors.New("user=%s, app=%s service=%s %v", user.Username, appName, serviceName, err)
	}

	return &deployedService{
		Name:        serviceName,
		FullName:    serviceFullName,
		ContainerID: createdContainer.ID,
		ImageName:   service.Image,
	}, nil
}

func (a *App) parseCompose(ctx context.Context, user *model.User, appName string, composeFile []byte) (newServices map[string]*deployedService, err error) {
	composeFile = bytes.Replace(composeFile, []byte("$$"), []byte("$"), -1)

	compose := dockerCompose{}
	if err := yaml.Unmarshal(composeFile, &compose); err != nil {
		return nil, errors.New("user=%s, app=%s %v", user.Username, appName, err)
	}

	defer func() {
		if err != nil {
			for _, service := range newServices {
				if _, rmErr := a.dockerApp.RmContainerAndImages(ctx, service.ContainerID, nil); rmErr != nil {
					logger.Error("%+v", rmErr)
				}
			}
		}
	}()

	newServices = make(map[string]*deployedService)
	for serviceName, service := range compose.Services {
		deployedService, createErr := a.createContainer(ctx, user, appName, serviceName, &service)
		if createErr != nil {
			err = createErr
			return
		}

		newServices[serviceName] = deployedService
	}

	return
}

// Handler for request. Should be use with net/http
func (a *App) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		user := auth.UserFromContext(r.Context())
		if user == nil {
			httperror.BadRequest(w, errors.New("user not provided"))
			return
		}

		appName, composeFile, err := checkParams(r, user)
		if err != nil {
			httperror.BadRequest(w, err)
			return
		}

		ctx := r.Context()

		oldContainers, err := a.checkRights(ctx, user, appName)
		if err != nil {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}

		newServices, err := a.parseCompose(ctx, user, appName, composeFile)
		if err != nil {
			httperror.InternalServerError(w, err)
			return
		}

		if err = a.checkTasks(user, appName); err != nil {
			httperror.InternalServerError(w, err)
			return
		}

		if err == nil {
			err = a.startServices(ctx, newServices)
		}

		ctx = context.Background()
		if span := opentracing.SpanFromContext(r.Context()); span != nil {
			parentSpanContext := span.Context()
			_, ctx = opentracing.StartSpanFromContext(ctx, "Deploy", opentracing.FollowsFrom(parentSpanContext))
		}

		go a.finishDeploy(ctx, user, appName, newServices, oldContainers, r.URL.Query())

		if err != nil {
			httperror.InternalServerError(w, err)
			return
		}

		if err := httpjson.ResponseArrayJSON(w, http.StatusOK, newServices, httpjson.IsPretty(r)); err != nil {
			httperror.InternalServerError(w, err)
		}
	})
}
