'use strict';

const tpEvent = {};

tpEvent.onMessage = function(request, sender, callback) {
    if (request.action in tpEvent.messageHandlers) {
        if (!sender.hasOwnProperty('tab') || sender.tab.id < 1) {
            sender.tab = {};
            sender.tab.id = page.currentTabId;
        }

        console.log('onMessage(' + request.action + ' => ' + (tpEvent.messageHandlers[request.action] ? request.action : null) + ') for #' + sender.tab.id);

        tpEvent.invoke(tpEvent.messageHandlers[request.action], callback, sender.tab.id, request.args);

        // onMessage closes channel for callback automatically
        // if this method does not return true
        if (callback !== undefined) {
            return true;
        }
    }
};

/**
 * Get interesting information about the given tab.
 * Function adapted from AdBlock-Plus.
 *
 * @param {function} handler to call after invoke
 * @param {function} callback to call after handler or null
 * @param {integer} senderTabId
 * @param {array} args
 * @param {bool} secondTime
 * @returns null (asynchronous)
 */
tpEvent.invoke = function(handler, callback, senderTabId, args, secondTime) {
    if (senderTabId < 1) {
        return;
    }

    if (!page.tabs[senderTabId]) {
        page.createTabEntry(senderTabId);
    }

    // Remove information from no longer existing tabs
    page.removePageInformationFromNotExistingTabs();

    browser.tabs.get(senderTabId).then((tab) => {
        if (!tab) {
            return;
        }

        if (!tab.url) {
            // Issue 6877: tab URL is not set directly after you opened a window
            // using window.open()
            if (!secondTime) {
                window.setTimeout(function() {
                    tpEvent.invoke(handler, callback, senderTabId, args, true);
                }, 250);
            }
            return;
        }

        if (!page.tabs[tab.id]) {
            page.createTabEntry(tab.id);
        }

        args = args || [];

        args.unshift(tab);
        args.unshift(callback);

        if (handler) {
            handler.apply(this, args);
        } else {
            console.log('undefined handler for tab ' + tab.id);
        }
    }).catch((e) => {
        console.log(e);
    });
};

tpEvent.onShowNotification = function(callback, tab, message) {
    if (page.settings.showNotifications) {
        showNotification(message);
    }
};

tpEvent.onLoadSettings = function(callback, tab) {
    page.initSettings().then((settings) => {
        teampass.reloadSettings();
        callback(settings);
    }, (err) => {
        console.log('error loading settings: ' + err);
    });
};

tpEvent.onSaveSettings = function(callback, tab, settings) {
    browser.storage.local.set({ 'settings': settings }).then(function() {
        tpEvent.onLoadSettings(callback, tab);
    });
};

tpEvent.onPopStack = function(callback, tab) {
    browserAction.stackPop(tab.id);
    browserAction.show(null, tab);
};

tpEvent.onGetTabInformation = function(callback, tab) {
    const id = tab.id || page.currentTabId;
    callback(page.tabs[id]);
};

tpEvent.onGetTeamPassVersions = function(callback, tab) {
    
};

tpEvent.onCheckUpdateTeamPass = function(callback, tab) {
    
};

tpEvent.onUpdateAvailableTeamPass = function(callback, tab) {
    
};

tpEvent.onRemoveCredentialsFromTabInformation = function(callback, tab) {
    const id = tab.id || page.currentTabId;
    page.clearCredentials(id);
};

tpEvent.onSetRememberPopup = function(callback, tab, username, password, url, title, usernameExists, credentialsList) {
    teampass.isConfigured().then((configured) => {
        if (configured.success) {
            browserAction.setRememberPopup(tab.id, username, password, url, title, usernameExists, credentialsList).then((result) => {
                if (result) {
                    callback();
                }
            });
        }
    });
};

tpEvent.onLoginPopup = function(callback, tab, logins) {
    const stackData = {
        level: 1,
        iconType: 'questionmark',
        popup: 'popup_login.html'
    };
    browserAction.stackUnshift(stackData, tab.id);
    page.tabs[tab.id].loginList = logins;
    page.tabs[tab.id].condition = window.location.host;
    browserAction.show(null, tab);
};

tpEvent.initHttpAuth = function(callback) {
    httpAuth.init();
    callback();
};

tpEvent.onHTTPAuthPopup = function(callback, tab, data) {
    const stackData = {
        level: 1,
        iconType: 'questionmark',
        popup: 'popup_httpauth.html'
    };
    browserAction.stackUnshift(stackData, tab.id);
    page.tabs[tab.id].loginList = data;
    browserAction.show(null, tab);
};

tpEvent.onMultipleFieldsPopup = function(callback, tab) {
    const stackData = {
        level: 1,
        iconType: 'normal',
        popup: 'popup_multiple-fields.html'
    };
    browserAction.stackUnshift(stackData, tab.id);
    browserAction.show(null, tab);
};

tpEvent.pageClearLogins = function(callback, tab, alreadyCalled) {
    if (!alreadyCalled) {
        page.clearLogins(tab.id);
    }
    callback();
};

tpEvent.pageGetLoginId = function(callback, tab) {
    callback(page.loginId);
};

tpEvent.pageSetLoginId = function(callback, tab, loginId) {
    page.loginId = loginId;
};

// All methods named in this object have to be declared BEFORE this!
tpEvent.messageHandlers = {
    'get_user_info': teampass.queryMyInfo,
    'get_user_folders': teampass.queryMyFolders,
    'add_credentials': teampass.addPassword,
    'check_update_teampass': tpEvent.onCheckUpdateTeamPass,
    // 'create_new_group': teampass.createNewGroup,
    'generate_password': teampass.generatePassword,
    // 'get_database_groups': teampass.getDatabaseGroups,
    'get_teampass_versions': tpEvent.onGetTeamPassVersions,
    'get_tab_information': tpEvent.onGetTabInformation,
    'init_http_auth': tpEvent.initHttpAuth,
    'load_settings': tpEvent.onLoadSettings,
    'page_clear_logins': tpEvent.pageClearLogins,
    'page_get_login_id': tpEvent.pageGetLoginId,
    'page_set_login_id': tpEvent.pageSetLoginId,
    'pop_stack': tpEvent.onPopStack,
    'popup_login': tpEvent.onLoginPopup,
    'popup_multiple-fields': tpEvent.onMultipleFieldsPopup,
    'remove_credentials_from_tab_information': tpEvent.onRemoveCredentialsFromTabInformation,
    'retrieve_credentials': teampass.searchPassword,
    'show_default_browseraction': browserAction.showDefault,
    'update_credentials': teampass.updatePassword,
    'save_settings': tpEvent.onSaveSettings,
    'set_remember_credentials': tpEvent.onSetRememberPopup,
    'show_notification': tpEvent.onShowNotification,
    'stack_add': browserAction.stackAdd
};
