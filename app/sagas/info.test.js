import test from 'ava';
import { call, put } from 'redux-saga/effects';
import Docker from '../services/Docker';
import actions from '../actions';
import { infoSaga } from './';

test('should call Docker.info', (t) => {
  const iterator = infoSaga();

  t.deepEqual(iterator.next().value, call(Docker.info));
});

test('should put success and fetchContaines after API call', (t) => {
  const iterator = infoSaga();
  iterator.next();

  t.deepEqual(iterator.next({}).value, [
    put(actions.infoSucceeded({})),
    put(actions.openBus()),
    put(actions.fetchContainers()),
  ]);
});

test('should put success, fetchContaines and fetchServices if Swarm', (t) => {
  const iterator = infoSaga();
  iterator.next();

  const fakeInfos = { Swarm: { NodeID: 1 } };

  t.deepEqual(iterator.next(fakeInfos).value, [
    put(actions.infoSucceeded(fakeInfos)),
    put(actions.openBus()),
    put(actions.fetchContainers()),
    put(actions.fetchServices()),
  ]);
});

test('should put error on failure', (t) => {
  const iterator = infoSaga({});
  iterator.next();

  t.deepEqual(iterator.throw(new Error('Test')).value, put(actions.infoFailed('Error: Test')));
});