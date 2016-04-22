# ep_webhooks
Webhooks for Etherpad Lite.

# WORK IN PROGRESS

While it's somewhat useful, work is in progress. See the **TODO** below. Any ideas and contributions are welcome, see the **TODO** section first.

# Configuration

In your Etherpad Lite ``settings.json``:

```
  "ep_webhooks": {
    "apiKey": "superSecretAPIkeySentInXApiKeyHeader"
    "pads": {
        "update": ["https://mydomain.com/api/internal/notifications/pads/update"]
    }
  }
```

* Where the ``pads.update`` configures webhook for ``pads.update`` event. See the "Supported hooks" section.
* You can specify multiple urls, each of them will be called on the event.
* The hook endpoint can authorize the call by verifying the secret in the ``X-API-KEY`` header

# Supported hooks

## pads.update

Hook is called when any of the pads is updated. Payload contains the id-s of the pads that have been modified.
 
Sample HTTP request made by ep_webhooks to the registered hook url:

```
POST https://mydomain.com/api/notifications/pads/update
{
    padIds: ['pad1', 'pad2', 'pad3']
}
```

# TODO

* Create API to register and de-register hooks instead of EP ``settings.json`` configuration.
    * Register must accept all parameters for the ``lodash.debounce`` ([https://lodash.com/docs#debounce]()). Right now the configuration is hardcoded. See ``serverHooks.js``.
    * API should do a pingback on registering to verify that the API is available.
    * Some kind of mechanism of verifying payloads. May want to borrow good ideas from GitHub [https://developer.github.com/webhooks/]() & [https://developer.github.com/v3/repos/hooks/#pubsubhubbub]().
* Back-off mechanism on errors - if a hook call fails too much, just stop sending or retry, but increase retry delay with each failure.
* Define method for telling ``ep_webhooks`` to temporarily delay calling registered hook.
    * Maybe overkill? You can register/de-register if you want to. 
    * For example response headers or HTTP response code. Useful when your system is under heavy load and you want to temporarily delay messages for a longer period of time.
  