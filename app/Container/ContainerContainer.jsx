import React, { Component } from 'react';
import { connect } from 'react-redux';
import { push } from 'react-router-redux';
import actions from './actions';
import Container from '../Presentational/Container/Container';

class ContainerComponent extends Component {
  componentDidMount() {
    this.props.fetchContainer(this.props.containerId);
  }

  componentWillUnmount() {
    this.props.closeLogs();
  }

  render() {
    const { container } = this.props;

    return (
      <Container
        pending={this.props.pending}
        pendingAction={this.props.pendingAction}
        container={this.props.container}
        logs={this.props.logs}
        onBack={this.props.onBack}
        onRefresh={() => this.props.actionContainer('infos', container.Id)}
        onStart={() => this.props.actionContainer('start', container.Id)}
        onRestart={() => this.props.actionContainer('restart', container.Id)}
        onStop={() => this.props.actionContainer('stop', container.Id)}
        onDelete={() => this.props.actionContainer('delete', container.Id)}
        openLogs={() => this.props.openLogs(container.Id)}
        error={this.props.error}
      />
    );
  }
}

ContainerComponent.propTypes = {
  containerId: React.PropTypes.string.isRequired,
  pending: React.PropTypes.bool.isRequired,
  pendingAction: React.PropTypes.bool.isRequired,
  container: React.PropTypes.shape({}),
  logs: React.PropTypes.arrayOf(React.PropTypes.string),
  error: React.PropTypes.string.isRequired,
  fetchContainer: React.PropTypes.func.isRequired,
  actionContainer: React.PropTypes.func.isRequired,
  onBack: React.PropTypes.func.isRequired,
  openLogs: React.PropTypes.func.isRequired,
  closeLogs: React.PropTypes.func.isRequired,
};

ContainerComponent.defaultProps = {
  container: null,
  logs: null,
};

const mapStateToProps = (state, props) => ({
  pending: !!state.pending[actions.FETCH_CONTAINER],
  pendingAction: !!state.pending[actions.ACTION_CONTAINER],
  container: state.container,
  logs: state.logs,
  error: state.error,
  containerId: props.match.params.containerId,
});

const mapDispatchToProps = dispatch => ({
  fetchContainer: id => dispatch(actions.fetchContainer(id)),
  actionContainer: (action, id) => dispatch(actions.actionContainer(action, id)),
  onBack: () => dispatch(push('/')),
  openLogs: id => dispatch(actions.openLogs(id)),
  closeLogs: () => dispatch(actions.closeLogs()),
});

/**
 * Container for handling container view.
 */
const ContainerContainer = connect(
  mapStateToProps,
  mapDispatchToProps,
)(ContainerComponent);
export default ContainerContainer;
