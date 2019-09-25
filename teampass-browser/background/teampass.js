'use strict';

const teampass = {};
teampass.serverConfig = {};

const tpActions = {
    WHO_AM_I: '/read/whoami',
    MY_PASSWORDS: '/read/mypws',
    MY_FOLDERS: '/read/myfolders',
    FIND_ITEM: '/find/item',
    GENERATE_PASSWORD: '/read/generate',
    ADD_ITEM: '/add/item',
    UPDATE_ITEM: '/update/item'
};

const tpActionsMethod = {
    '/find/item': 'POST',
    '/add/item': 'POST',
    '/update/item': 'POST',
    '/read/generate': 'POST'
};

const kpErrors = {
    UNKNOWN_ERROR: 0,
    DATABASE_NOT_OPENED: 1,
    DATABASE_HASH_NOT_RECEIVED: 2,
    CLIENT_PUBLIC_KEY_NOT_RECEIVED: 3,
    CANNOT_DECRYPT_MESSAGE: 4,
    TIMEOUT_OR_NOT_CONNECTED: 5,
    ACTION_CANCELLED_OR_DENIED: 6,
    PUBLIC_KEY_NOT_FOUND: 7,
    ASSOCIATION_FAILED: 8,
    KEY_CHANGE_FAILED: 9,
    ENCRYPTION_KEY_UNRECOGNIZED: 10,
    NO_SAVED_DATABASES_FOUND: 11,
    INCORRECT_ACTION: 12,
    EMPTY_MESSAGE_RECEIVED: 13,
    NO_URL_PROVIDED: 14,
    NO_LOGINS_FOUND: 15,

    errorMessages: {
        0: { msg: tr('errorMessageUnknown') },
        1: { msg: tr('errorMessageDatabaseNotOpened') },
        2: { msg: tr('errorMessageDatabaseHash') },
        3: { msg: tr('errorMessageClientPublicKey') },
        4: { msg: tr('errorMessageDecrypt') },
        5: { msg: tr('errorMessageTimeout') },
        6: { msg: tr('errorMessageCanceled') },
        7: { msg: tr('errorMessageEncrypt') },
        8: { msg: tr('errorMessageAssociate') },
        9: { msg: tr('errorMessageKeyExchange') },
        10: { msg: tr('errorMessageEncryptionKey') },
        11: { msg: tr('errorMessageSavedDatabases') },
        12: { msg: tr('errorMessageIncorrectAction') },
        13: { msg: tr('errorMessageEmptyMessage') },
        14: { msg: tr('errorMessageNoURL') },
        15: { msg: tr('errorMessageNoLogins') }
    },

    getError(errorCode) {
        return this.errorMessages[errorCode].msg;
    }
};

teampass.reloadSettings = function () {
    browser.storage.local.get({ 'settings': {} }).then((item) => {
        teampass.serverConfig.apiUrl = item.settings.teampassServerURL;
        teampass.serverConfig.apiKey = item.settings.teampassApiKey;
        teampass.serverConfig.saltKey = item.settings.teampassSaltKey;
    });
}

teampass.isConfigured = async function () {
    return new Promise((resolve, reject) => {
        browser.storage.local.get({ 'whoami': {} }).then((item) => {
            resolve(item.whoami);
        });
    });
}

teampass.sendRestHttpRequest = async function(action, payload) {
    return new Promise((resolve, reject) => {
        const serverConfig = teampass.serverConfig;
        if (!serverConfig.apiUrl) {
            return resolve({ error_code: 500, success: false, message: '未配置服务器地址', data: {} });
        }
        const path = action;
        const method = action in tpActionsMethod ? tpActionsMethod[action] : 'GET';
        let url = serverConfig.apiUrl + path + "?apikey=" + encodeURIComponent(serverConfig.apiKey);
        if (serverConfig.saltKey && serverConfig.saltKey.length > 0) {
            url = url + "&saltkey=" + encodeURIComponent(serverConfig.saltKey);
        }
        
        const xhr = new XMLHttpRequest();
        xhr.onload = function (e) {
            try{
                const json = JSON.parse(xhr.responseText);
                resolve(json);
            } catch(e) {
                resolve({error_code: 500, success: false, message: xhr.responseText, data: {}})
            }
        };

        xhr.onerror = function (e) {
            console.log('sendRestHttpRequest error:' + e);
            reject(e);
        };

        try {
            xhr.open(method, url, true);
            xhr.send(payload ? JSON.stringify(payload) : null);
        } catch (ex) {
            console.log(ex);
        }
    });
};

teampass.queryMyInfo = async function(callback, tab) {
    teampass.sendRestHttpRequest(tpActions.WHO_AM_I, null).then(response => {
        browser.storage.local.set({ 'whoami': response });
        callback(response);
    });
};

teampass.queryMyPasswords = async function(callback, tab) {
    teampass.sendRestHttpRequest(tpActions.MY_PASSWORDS, null).then(response => {
        callback(response);
    });
};

teampass.queryMyFolders = async function (callback, tab) {
    teampass.sendRestHttpRequest(tpActions.MY_FOLDERS, null).then(response => {
        let groups = [];
        let groupMap = {}
        for (let i = 0; i < response.data.length; i++) {
            const g = response.data[i];
            if (g.level === '1') {
                groups.push(g);
            }
            g.children = [];
            groupMap[g.id] = g;
        }
        for (let i = 0; i < response.data.length; i++) {
            const g = response.data[i];
            if (g.level !== '1') {
                if (g.parent_id in groupMap) {
                    groupMap[g.parent_id].children.push(g);
                } else {
                    groups.push(g);
                }
            }
        }
        callback(groups);
    });
};

teampass.searchPassword = async function (callback, tab, url, keyword) {
    teampass.sendRestHttpRequest(tpActions.FIND_ITEM, { keyword: keyword, url: url}).then(response => {
        callback(response);
    });
};

teampass.generatePassword = async function(callback, tab, length) {
    teampass.sendRestHttpRequest(tpActions.GENERATE_PASSWORD, {length: length}).then(response => {
        callback(response);
    });
};

teampass.addPassword = function (callback, tab, label, description, login, email, password, folder_id, url, tags) {
    let payload = {
        label: label ? label : "",
        description: description ? description : "",
        login: login ? login : "",
        email: email ? email : "",
        pwd: password,
        folder_id: folder_id,
        url: url ? url : "",
        tags: tags ? tags : "",
        anyonecanmodify: 0
    };
    teampass.sendRestHttpRequest(tpActions.ADD_ITEM, payload).then(response => {
        callback(response);
    });
};

teampass.updatePassword = function (callback, tab, id, label, description, login, email, password, folder_id, url, tags) {
    let payload = {
        id: id,
        label: label ? label : "",
        description: description ? description : "",
        login: login ? login : "",
        email: email ? email : "",
        pwd: password,
        folder_id: folder_id,
        url: url ? url : "",
        tags: tags ? tags : ""
    };
    teampass.sendRestHttpRequest(tpActions.ADD_ITEM, payload).then(response => {
        callback(response);
    });
};

teampass.reloadSettings();