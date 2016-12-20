package main

import (
	"github.com/ViBiOh/docker-deploy/docker"
	"log"
	"net/http"
	"runtime"
)

const port = `1080`

const host = `DOCKER_HOST`
const version = `DOCKER_VERSION`

func main() {
	runtime.GOMAXPROCS(runtime.NumCPU())

	http.Handle(`/`, docker.Handler{})

	log.Print(`Starting server on port ` + port)
	log.Fatal(http.ListenAndServe(`:`+port, nil))
}