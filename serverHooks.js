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

    var changedPadIds = Object.keys(changedPads);
    changedPads = {};

    logger.debug('pluginSettings', pluginSettings);
    var updateHooksToCall = _.get(pluginSettings, ['pads', 'update']);

    if (Array.isArray(updateHooksToCall)) {
        // Fire and forget - no guarantees of delivery for now
        updateHooksToCall.forEach(function (path) {
            request
                .post(path)
                .set('X-API-KEY', pluginSettings.apiKey)
                .send({padIds: changedPadIds})
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
            var padId = _.get(padMessageHandler.sessioninfos[context.client.id], 'padId');
            if (padId) {
                logger.debug('handleMessage', 'PAD CHANGED', padId);
                changedPads[padId] = 1; // Use object, as then I don't need to worry about duplicates
                callPadUpdateWebhooks();
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
    } else {
        logger.warn('Plugin configuration not found, doing nothing.')
    }
};