import test from 'ava';
import { call, put } from 'redux-saga/effects';
import { push } from 'react-router-redux';
import DockerService from '../../Service/DockerService';
import actions from '../actions';
import { composeSaga } from './';

test('should call DockerService.containerCreate with given name and file', (t) => {
  const iterator = composeSaga({
    name: 'Test',
    file: 'File of test',
  });

  t.deepEqual(iterator.next().value, call(DockerService.containerCreate, 'Test', 'File of test'));
});

test('should put success and redirect to home after API call', (t) => {
  const iterator = composeSaga({});
  iterator.next();

  t.deepEqual(iterator.next().value, [put(actions.composeSucceeded()), put(push('/'))]);
});

test('should put error on failure', (t) => {
  const iterator = composeSaga({});
  iterator.next();

  t.deepEqual(iterator.throw(new Error('Test')).value, put(actions.composeFailed('Error: Test')));
});
