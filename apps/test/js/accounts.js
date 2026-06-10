/* ===== accounts.js : 계정 전용 저장소/헬퍼 =====
 *
 *  역할:
 *   - DEFAULT_USERS(초기 시드)와 런타임 USERS를 분리합니다.
 *   - 로그인, 관리자 계정 수정, localStorage 복원이 모두 이 파일의 함수를 사용합니다.
 *   - 현재는 브라우저 앱이므로 "파일 저장"은 못 하고, 런타임 상태 + localStorage를 관리합니다.
 */
(function () {
  'use strict';

  function cloneUsers(src) {
    return JSON.parse(JSON.stringify(src || {}));
  }

  function sanitizeUser(user) {
    if (!user) return null;
    return {
      pw: String(user.pw || ''),
      role: user.role === 'admin' ? 'admin' : 'user',
      name: String(user.name || '')
    };
  }

  let USERS = cloneUsers(window.DEFAULT_USERS);

  window.getUsers = function () {
    return USERS;
  };

  window.getUser = function (id) {
    return USERS[id] || null;
  };

  window.hasUser = function (id) {
    return !!USERS[id];
  };

  window.authenticateUser = function (id, pw) {
    const user = window.getUser(id);
    return !!(user && user.pw === pw);
  };

  window.createUser = function (id, userData) {
    if (!id || window.hasUser(id)) return false;
    USERS[id] = sanitizeUser(userData);
    return true;
  };

  window.updateUser = function (id, patch) {
    const user = window.getUser(id);
    if (!user) return false;
    const next = {
      pw: patch && Object.prototype.hasOwnProperty.call(patch, 'pw') ? patch.pw : user.pw,
      role: patch && Object.prototype.hasOwnProperty.call(patch, 'role') ? patch.role : user.role,
      name: patch && Object.prototype.hasOwnProperty.call(patch, 'name') ? patch.name : user.name
    };
    USERS[id] = sanitizeUser(next);
    return true;
  };

  window.deleteUserAccount = function (id) {
    if (!window.hasUser(id)) return false;
    delete USERS[id];
    return true;
  };

  window.replaceUsers = function (nextUsers) {
    USERS = cloneUsers(nextUsers);
    return USERS;
  };

  window.resetUsersFromSeed = function () {
    USERS = cloneUsers(window.DEFAULT_USERS);
    return USERS;
  };
})();
