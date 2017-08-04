package oauth

import (
	"crypto/sha512"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/ViBiOh/dashboard/fetch"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
)

const accessTokenURL = `https://github.com/login/oauth/access_token?`

type githubUser struct {
	Login string `json:"login"`
}

var (
	state       string
	redirectURL string
	oauthConf   *oauth2.Config
)

// Init retrieve env variables
func Init() {
	state = os.Getenv(`OAUTH_STATE`)
	redirectURL = os.Getenv(`OAUTH_REDIRECT_URL`)

	oauthConf = &oauth2.Config{
		ClientID:     os.Getenv(`GITHUB_OAUTH_CLIENT_ID`),
		ClientSecret: os.Getenv(`GITHUB_OAUTH_CLIENT_SECRET`),
		Endpoint:     github.Endpoint,
	}
}

func oauthRedirectHandler(w http.ResponseWriter, r *http.Request) {
	if state != r.FormValue(`state`) {
		http.Error(w, `Invalid state provided during oauth process`, http.StatusUnauthorized)
		return
	}

	token, err := oauthConf.Exchange(oauth2.NoContext, r.FormValue(`code`))
	if err != nil {
		http.Error(w, `Invalid code provided during oauth process`, http.StatusUnauthorized)
		return
	}

	httpGithubClient := oauthConf.Client(oauth2.NoContext, token)
	userResponse, err := httpGithubClient.Get(`https://api.github.com/user`)
	if err != nil {
		http.Error(w, fmt.Sprintf(`Error while getting user informations: %v`, err), http.StatusUnauthorized)
		return
	}

	content, err := fetch.ReadBody(userResponse.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf(`Error while reading user informations: %v`, err), http.StatusInternalServerError)
		return
	}

	user := githubUser{}
	if err := json.Unmarshal(content, &user); err != nil {
		http.Error(w, fmt.Sprintf(`Error while unmarshalling GitHub user informations: %v`, err), http.StatusInternalServerError)
		return
	}

	log.Printf(`Logged in as GitHub login %s with token %s`, user.Login, fmt.Sprintf(`%x`, sha512.Sum512([]byte(token.AccessToken))))
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

// Handler for Docker request. Should be use with net/http
type Handler struct {
}

func (handler Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	oauthRedirectHandler(w, r)
}
