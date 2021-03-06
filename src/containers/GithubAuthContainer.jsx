import React from 'react';
import { connect } from 'react-redux';
import SearchParams from 'utils/SearchParams';
import actions from 'actions';
import Wrapper from 'presentationals/Login/Wrapper';
import Github from 'presentationals/Login/Github';

/**
 * Select props from Redux state.
 * @param {Object} state Current state
 */
function mapStateToProps(state, { location: { search } }) {
  const params = SearchParams(search);

  return {
    error: params.error_description || state.error,
    state: params.state,
    code: params.code,
    redirect: params.redirect,
  };
}

/**
 * Provide dispatch functions in props.
 * @param {Function} dispatch Redux dispatch function
 */
function mapDispatchToProps(dispatch) {
  return {
    component: (
      <Github
        getAccessToken={(state, code, redirect) => {
          dispatch(actions.getGithubAccessToken(state, code, redirect));
        }}
      />
    ),
  };
}

/**
 * Github connected.
 */
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(Wrapper);
