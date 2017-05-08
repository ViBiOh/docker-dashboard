import test from 'ava';
import sinon from 'sinon';
import funtch from 'funtch';
import btoa from '../Tools/btoa';
import localStorageService from './LocalStorageService';
import DockerService, { authStorage } from './DockerService';

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

test.serial('should determine if already logged', t => {
  t.true(DockerService.isLogged());
});

test.serial('should determine if not already logged', t => {
  localStorageService.getItem.restore();
  sinon.stub(localStorageService, 'getItem').callsFake(() => '');

  t.false(DockerService.isLogged());
});

test.serial('should login with given username and password', t =>
  DockerService.login('admin', 'password').then(result => {
    t.true(/auth$/.test(result.url));
    t.is(result.auth, `Basic ${btoa('admin:password')}`);
  }),
);

test.serial('should store token in localStorage on login', t => {
  const setItemSpy = sinon.spy(localStorageService, 'setItem');

  return DockerService.login('admin', 'password').then(() => {
    localStorageService.setItem.restore();
    t.true(setItemSpy.calledWith(authStorage, `Basic ${btoa('admin:password')}`));
  });
});

test.serial('should drop stored token from localStorage on logout', t => {
  const removeItemSpy = sinon.spy(localStorageService, 'removeItem');

  return DockerService.logout().then(() => {
    localStorageService.removeItem.restore();
    t.true(removeItemSpy.calledWith(authStorage));
  });
});

test.serial('should list containers with auth', t =>
  DockerService.containers().then(() => {
    t.true(getItemSpy.calledWith(authStorage));
  }),
);

test.serial('should return results when listing containers', t => {
  data = {
    results: [
      {
        id: 1,
      },
    ],
  };

  return DockerService.containers().then(value => t.deepEqual(value, [{ id: 1 }]));
});

test.serial('should create container with given args', t =>
  DockerService.create('test', 'composeFileContent').then(result => {
    t.true(/containers\/test\/$/.test(result.url));
    t.is(result.content, 'composeFileContent');
  }),
);

[
  { method: 'infos', args: ['test'], httpMethod: 'get', url: /containers\/test\/$/ },
  {
    method: 'create',
    args: ['test', 'composeFileContent'],
    httpMethod: 'post',
    url: /containers\/test\/$/,
  },
  { method: 'start', args: ['test'], httpMethod: 'post', url: /containers\/test\/start$/ },
  { method: 'stop', args: ['test'], httpMethod: 'post', url: /containers\/test\/stop$/ },
  { method: 'restart', args: ['test'], httpMethod: 'post', url: /containers\/test\/restart$/ },
  { method: 'delete', args: ['test'], httpMethod: 'delete', url: /containers\/test\/$/ },
].forEach(param => {
  test.serial(`for ${param.method}`, t =>
    DockerService[param.method].apply(null, param.args).then(result => {
      t.is(result.method, param.httpMethod);
      t.true(param.url.test(result.url));
      t.true(getItemSpy.calledWith(authStorage));
    }),
  );
});

test.serial('should send auth on logs opening', t => {
  const onMessage = sinon.spy();
  const wsSend = sinon.spy();

  global.WebSocket = () => ({
    send: wsSend,
    onmessage: onMessage,
  });

  DockerService.logs('test', onMessage).onopen();

  t.true(wsSend.calledWith('token'));
  t.true(getItemSpy.calledWith(authStorage));
});

test.serial('should call onMessage when receiving', t => {
  const onMessage = sinon.spy();
  const wsSend = sinon.spy();

  global.WebSocket = () => ({
    send: wsSend,
    onmessage: onMessage,
  });

  DockerService.logs('test', onMessage).onmessage({ data: 'test' });

  t.true(onMessage.calledWith('test'));
});

test.serial('should send auth on stats opening', t => {
  const onMessage = sinon.spy();
  const wsSend = sinon.spy();

  global.WebSocket = () => ({
    send: wsSend,
    onmessage: onMessage,
  });

  DockerService.stats('test', onMessage).onopen();

  t.true(wsSend.calledWith('token'));
  t.true(getItemSpy.calledWith(authStorage));
});

test.serial('should call onMessage when receiving', t => {
  const onMessage = sinon.spy();
  const wsSend = sinon.spy();

  global.WebSocket = () => ({
    send: wsSend,
    onmessage: onMessage,
  });

  DockerService.stats('test', onMessage).onmessage({ data: 'test' });

  t.true(onMessage.calledWith('test'));
});

test.serial('should send auth on events opening', t => {
  const onMessage = sinon.spy();
  const wsSend = sinon.spy();

  global.WebSocket = () => ({
    send: wsSend,
    onmessage: onMessage,
  });

  DockerService.events(onMessage).onopen();

  t.true(wsSend.calledWith('token'));
  t.true(getItemSpy.calledWith(authStorage));
});

test.serial('should call onMessage callback', t => {
  const onMessage = sinon.spy();
  const wsSend = sinon.spy();

  global.WebSocket = () => ({
    send: wsSend,
    onmessage: onMessage,
  });

  DockerService.events(onMessage).onmessage({ data: 'test' });

  t.true(onMessage.calledWith('test'));
});
