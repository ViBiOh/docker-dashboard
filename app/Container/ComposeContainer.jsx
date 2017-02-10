import React, { Component } from 'react';
import { browserHistory } from 'react-router';
import DockerService from '../Service/DockerService';
import Compose from '../Presentational/Compose/Compose';

export default class ComposeContainer extends Component {
  constructor(props) {
    super(props);

    this.state = {};

    this.create = this.create.bind(this);
  }

  create(name, compose) {
    this.setState({ error: undefined });

    return DockerService.create(name, compose)
      .then((data) => {
        browserHistory.push('/');
        return data;
      })
      .catch((error) => {
        this.setState({ error: error.content });
        return error;
      });
  }

  render() {
    return (
      <Compose onCompose={this.create} error={this.state.error} />
    );
  }
}