var PLUGIN_NAME = 'ep_webhooks';

var _ = require('lodash');
var request = require('superagent');

var logger = require('ep_etherpad-lite/node_modules/log4js').getLogger(PLUGIN_NAME);
var padMessageHandler = require('ep_etherpad-lite/node/handler/PadMessageHandler.js');

var pluginSettings; // set with loadSettings hook
var changedPads = {}; // Pads that have changed. key = padId, value = 1

/**
 * Call the webhooks
 *
 * The ``debounce`` is used to delay execution.
 *
 * @see {@link https://lodash.com/docs#debounce}
 */
var callPadUpdateWebhooks = _.debounce(function () {
    logger.debug('callPadUpdateWebhooks', changedPads);

    // No pads changed
    if (!Object.keys(changedPads).length) {
        return;
    }

    var changedPadIds = changedPads;

    var padIds = Object.keys(changedPadIds);
    padIds.forEach(function (padId) {
        changedPadIds[padId].forEach(function (user) {
            delete user.author;
        })
    });
    changedPads = {};

    var updateHooksToCall = _.get(pluginSettings, ['pads', 'update']);

    if (Array.isArray(updateHooksToCall)) {
        // Fire and forget - no guarantees of delivery for now
        updateHooksToCall.forEach(function (path) {
            var req = request
                .post(path);

            // The support for self signed certificates
            var caCert = pluginSettings.caCert;
            if (caCert) {
                req.ca(caCert);
            }

            req
                .set('X-API-KEY', pluginSettings.apiKey)
                .send({pads: changedPadIds})
                .end(function (err, res) {
                    if (err) {
                        logger.error('callPadUpdateWebhooks - HTTP POST failed to ', path, '. Error was', err);
                    }
                });
        });
    }
}, 1000, {maxWait: 5000});

/**
 * handleMessage hook
 *
 * @param {string} hook_name
 * @param {object} context
 * @param {Function} cb Callback
 *
 * @see {@link http://etherpad.org/doc/v1.5.7/#index_handlemessage}
 */
exports.handleMessage = function (hook_name, context, cb) {
    logger.debug('handleMessage');

    if (pluginSettings) {
        var messageType = _.get(context.message, 'data.type');

        if (messageType === 'USER_CHANGES') {
            var user = _.get(context, 'client.conn.request.session.user');
            var clientId = _.get(context, 'client.id');
            var rev = _.get(padMessageHandler, 'sessioninfos[' + clientId + '].rev');
            var padId = _.get(padMessageHandler, 'sessioninfos[' + clientId + '].padId');
            var author = _.get(padMessageHandler, 'sessioninfos[' + clientId + '].author');

            if (padId) {
                logger.debug('handleMessage', 'PAD CHANGED', padId);
                if (changedPads[padId]) {
                    var userIndex = _.findIndex(changedPads[padId], function (e) {return e.userId === user.id;});
                    if (userIndex  > -1 ) {
                        changedPads[padId].splice(userIndex, 1);
                    }
                } else {
                    changedPads[padId] = [];    
                }
                changedPads[padId].push({userId: user.id, author: author, rev: rev}); // Use object, as then I don't need to worry about duplicates
            } else {
                logger.warn('handleMessage', 'Pad changed, but no padId!');
            }
        }
    }

    return cb([context.message]);
};

/**
 * loadSettings
 *
 * @param {string} hook_name "loadSettings"
 * @param {object} args Object {settings: {object}}
 *
 * @see {@link http://etherpad.org/doc/v1.5.7/#index_loadsettings}
 */
exports.loadSettings = function (hook_name, args) {
    var settings = args.settings;
    if (settings && settings[PLUGIN_NAME]) {
        pluginSettings = settings[PLUGIN_NAME];

        logger.debug('loadSettings', 'pluginSettings', pluginSettings);

        var caCert = pluginSettings.caCert;
        if (caCert) {
            if (caCert.indexOf('-----BEGIN CERTIFICATE-----') !== 0) {
                logger.error('Invalid configuration! If you provide caCert, make sure it looks like a cert.');
                process.exit(1);
            }
        }
    } else {
        logger.warn('Plugin configuration not found, doing nothing.')
    }
};

exports.padUpdate = function (hook_name, context, cb) {
    if(context.pad.id && changedPads[context.pad.id] && changedPads[context.pad.id].length) {
        changedPads[context.pad.id].forEach(function (pad, key) {
            if (pad.author === context.author) {
                changedPads[context.pad.id][key].rev = context.pad.head;
            }
        });
        callPadUpdateWebhooks();
        return cb(true);
    }
};