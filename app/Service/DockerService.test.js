import test from 'ava';
import sinon from 'sinon';
import funtch from 'funtch';
import btoa from '../Tools/btoa';
import { STORAGE_KEY_AUTH } from '../Constants';
import localStorageService from './LocalStorageService';
import DockerService from './DockerService';

let data;
let getItemSpy;

sinon.stub(localStorageService, 'isEnabled').callsFake(() => false);

test.beforeEach(() => {
  data = null;

  function send(url, auth, method, content) {
    if (data) {
      return Promise.resolve(data);
    }

    return Promise.resolve({
      url,
      auth,
      content,
      method,
    });
  }

  const fetch = (url, auth) => ({
    get: () => send(url, auth, 'get'),
    post: body => send(url, auth, 'post', body),
    put: body => send(url, auth, 'put', body),
    delete: () => send(url, auth, 'delete'),
  });

  getItemSpy = sinon.stub(localStorageService, 'getItem').callsFake(() => 'token');

  sinon.stub(funtch, 'url').callsFake(url => ({
    error: () => ({
      auth: auth => ({
        ...fetch(url, auth),
        error: () => fetch(url, auth),
      }),
    }),
  }));
});

test.afterEach(() => {
  funtch.url.restore();
  localStorageService.getItem.restore();
});

test.serial('should login with given username and password', t =>
  DockerService.login('admin', 'password').then((result) => {
    t.true(/auth$/.test(result.url));
    t.is(result.auth, `Basic ${btoa('admin:password')}`);
  }),
);

test.serial('should store token in localStorage on login', (t) => {
  const setItemSpy = sinon.spy(localStorageService, 'setItem');

  return DockerService.login('admin', 'password').then(() => {
    localStorageService.setItem.restore();
    t.true(setItemSpy.calledWith(STORAGE_KEY_AUTH, `Basic ${btoa('admin:password')}`));
  });
});

test.serial('should throw error if not auth find', (t) => {
  localStorageService.getItem.restore();
  sinon.stub(localStorageService, 'getItem').callsFake(() => '');

  const error = t.throws(() => DockerService.containers());
  t.is(error.message, 'Authentification not find');
});

test.serial('should list containers with auth', t =>
  DockerService.containers().then(() => {
    t.true(getItemSpy.calledWith(STORAGE_KEY_AUTH));
  }),
);

test.serial('should return results when listing containers', (t) => {
  data = {
    results: [
      {
        id: 1,
      },
    ],
  };

  return DockerService.containers().then(value => t.deepEqual(value, [{ id: 1 }]));
});

test.serial('should list services with auth', t =>
  DockerService.services().then(() => {
    t.true(getItemSpy.calledWith(STORAGE_KEY_AUTH));
  }),
);

test.serial('should return results when listing services', (t) => {
  data = {
    results: [
      {
        id: 1,
      },
    ],
  };

  return DockerService.services().then(value => t.deepEqual(value, [{ id: 1 }]));
});

test.serial('should create container with given args', t =>
  DockerService.containerCreate('test', 'composeFileContent').then((result) => {
    t.true(/containers\/test\/$/.test(result.url));
    t.is(result.content, 'composeFileContent');
  }),
);

[
  { method: 'info', args: [], httpMethod: 'get', url: /info$/ },
  { method: 'containerInfos', args: ['test'], httpMethod: 'get', url: /containers\/test\/$/ },
  {
    method: 'containerCreate',
    args: ['test', 'composeFileContent'],
    httpMethod: 'post',
    url: /containers\/test\/$/,
  },
  { method: 'containerStart', args: ['test'], httpMethod: 'post', url: /containers\/test\/start$/ },
  { method: 'containerStop', args: ['test'], httpMethod: 'post', url: /containers\/test\/stop$/ },
  {
    method: 'containerRestart',
    args: ['test'],
    httpMethod: 'post',
    url: /containers\/test\/restart$/,
  },
  { method: 'containerDelete', args: ['test'], httpMethod: 'delete', url: /containers\/test\/$/ },
].forEach((param) => {
  test.serial(`for ${param.method}`, t =>
    DockerService[param.method].apply(null, param.args).then((result) => {
      t.is(result.method, param.httpMethod);
      t.true(param.url.test(result.url));
      t.true(getItemSpy.calledWith(STORAGE_KEY_AUTH));
    }),
  );
});

test.serial('should send auth on streamBus opening', (t) => {
  const onMessage = sinon.spy();
  const wsSend = sinon.spy();

  global.WebSocket = () => ({
    send: wsSend,
    onmessage: onMessage,
  });

  DockerService.streamBus(onMessage).onopen();

  t.true(wsSend.calledWith('token'));
  t.true(getItemSpy.calledWith(STORAGE_KEY_AUTH));
});

test.serial('should call onMessage callback for streamBus', (t) => {
  const onMessage = sinon.spy();
  const wsSend = sinon.spy();

  global.WebSocket = () => ({
    send: wsSend,
    onmessage: onMessage,
  });

  DockerService.streamBus(onMessage).onmessage({ data: 'test' });

  t.true(onMessage.calledWith('test'));
});
