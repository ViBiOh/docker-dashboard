package docker

import (
	"errors"
	"reflect"
	"testing"

	"github.com/ViBiOh/auth/auth"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
)

func TestIsAdmin(t *testing.T) {
	var cases = []struct {
		user *auth.User
		want bool
	}{
		{
			nil,
			false,
		},
		{
			auth.NewUser(0, `guest`, `guest,multi`),
			false,
		},
		{
			auth.NewUser(0, `admin`, `admin`),
			true,
		},
	}

	for _, testCase := range cases {
		if result := isAdmin(testCase.user); result != testCase.want {
			t.Errorf(`isAdmin(%v) = %v, want %v`, testCase.user, result, testCase.want)
		}
	}
}

func TestIsMultiApp(t *testing.T) {
	var cases = []struct {
		user *auth.User
		want bool
	}{
		{
			nil,
			false,
		},
		{
			auth.NewUser(0, `guest`, `guest,multi`),
			true,
		},
		{
			auth.NewUser(0, `admin`, `admin`),
			true,
		},
	}

	for _, testCase := range cases {
		if result := isMultiApp(testCase.user); result != testCase.want {
			t.Errorf(`isMultiApp(%v) = %v, want %v`, testCase.user, result, testCase.want)
		}
	}
}

func TestIsAllowed(t *testing.T) {
	var cases = []struct {
		dockerResponse interface{}
		user           *auth.User
		containerID    string
		want           bool
		wantContainer  *types.ContainerJSON
		wantErr        error
	}{
		{
			nil,
			nil,
			``,
			false,
			nil,
			errors.New(`An user is required`),
		},
		{
			nil,
			auth.NewUser(0, `admin`, `admin`),
			``,
			false,
			nil,
			errors.New(`Error while inspecting container: error during connect: Get http://localhost/containers/json: internal server error`),
		},
		{
			types.ContainerJSON{},
			auth.NewUser(0, `admin`, `admin`),
			``,
			true,
			&types.ContainerJSON{},
			nil,
		},
		{
			types.ContainerJSON{Config: &container.Config{}},
			auth.NewUser(0, `guest`, `guest`),
			``,
			false,
			nil,
			nil,
		},
		{
			types.ContainerJSON{Config: &container.Config{Labels: map[string]string{ownerLabel: `guest`}}},
			auth.NewUser(0, `guest`, `guest`),
			``,
			true,
			&types.ContainerJSON{Config: &container.Config{Labels: map[string]string{ownerLabel: `guest`}}},
			nil,
		},
	}

	var failed bool

	for _, testCase := range cases {
		docker = mockClient(t, []interface{}{testCase.dockerResponse})
		result, container, err := isAllowed(testCase.user, testCase.containerID)

		failed = false

		if err == nil && testCase.wantErr != nil {
			failed = true
		} else if err != nil && testCase.wantErr == nil {
			failed = true
		} else if err != nil && err.Error() != testCase.wantErr.Error() {
			failed = true
		} else if result != testCase.want {
			failed = true
		} else if !reflect.DeepEqual(container, testCase.wantContainer) {
			failed = true
		}

		if failed {
			t.Errorf(`isAllowed(%v, %v) = (%v, %v, %v), want (%v, %v, %v)`, testCase.user, testCase.containerID, result, container, err, testCase.want, testCase.wantContainer, testCase.wantErr)
		}
	}
}
