# ZIP Unpacker extension

This is the ZIP Unpacker extension used in Chrome OS to support reading and
unpacking of zip archives.

## Build steps

### NaCl SDK

Since the code is built with NaCl, you'll need its toolchain.  See the
[download page](https://developer.chrome.com/native-client/sdk/download).
The install location does not matter as it'll be set via ``NACL_SDK_ROOT``.

You should install the current stable version.

```
$ wget https://storage.googleapis.com/nativeclient-mirror/nacl/nacl_sdk/nacl_sdk.zip
$ unzip -u nacl_sdk.zip
$ ./nacl_sdk/naclsdk install
```

Then configure the path to the root of the specific SDK version.

```
# This assumes there's only one version of the SDK.
$ export NACL_SDK_ROOT=$(echo ${PWD}/nacl_sdk/pepper_*)
```

### Webports (a.k.a. NaCl ports)

We'll use libraries from [webports](https://chromium.googlesource.com/webports/).
See [How to Checkout](https://chromium.googlesource.com/webports/#How-to-Checkout).

The install location does not matter as it'll be set via ``WEBPORTS_PATH``.

Make sure to checkout the branch that matches the version of the SDK you're
using.  If you're using ``pepper_47``, then check out the ``pepper_47`` branch.

```
$ cd src
$ branch=$(basename "${NACL_SDK_ROOT}")
$ git checkout -b ${branch} remotes/origin/${branch}
$ cd ..
$ export WEBPORTS_PATH=${PWD}
```

### npm Setup

First install [npm](https://www.npmjs.com/) using your normal packaging system.
On Debian, you'll want something like:

```
$ sudo apt-get install npm
```

Then install the npm modules that we require.  Do this in the root of the
unpacker repo.

```
$ npm install bower 'vulcanize@<0.8'
```

### Unpacker Build

Once done, install the libarchive-fork from third-party of the unpacker
project. Note that you cannot use libarchive nor libarchive-dev packages from
webports at this moment, as not all patches in the fork are upstreamed.

```
$ cd third-party
$ make libarchive-fork
```

Polymer is used for UI. In order to fetch it, in the same directory type:

```
$ make polymer
```

Build the PNaCl module.

```
$ cd unpacker
$ make [debug]
```

## Use

The package can be found in the release or debug directory.  You can run it
directly from there using Chrome's "Load unpacked extension" feature, or you
can zip it up for posting to the Chrome Web Store.

```
$ zip -r release.zip release/
```

Once it's loaded, you should be able to open ZIP archives in the Files app.

## Debugging

To see debug messages open chrome from a terminal and check the output.
For output redirection see
https://developer.chrome.com/native-client/devguide/devcycle/debugging.

## Testing

Install [Karma](http://karma-runner.github.io/0.12/index.html) for tests
runner, [Mocha](http://visionmedia.github.io/mocha/) for asynchronous testings,
[Chai](http://chaijs.com/) for assertions, and [Sinon](http://sinonjs.org/) for
spies and stubs.

```
$ npm install karma --save-dev
$ npm install karma-chrome-launcher --save-dev
$ npm install -g karma-cli
$ npm install mocha --save-dev
$ npm install karma-mocha --save-dev
$ npm install karma-chai --save-dev
$ npm install karma-sinon --save-dev
$ npm install karma-chrome-launcher --save-dev

# Run tests:
$ cd unpacker-test
$ ./run_js_tests.sh  # JavaScript tests.
$ ./run_cpp_tests.sh  # C++ tests.

# Check JavaScript code using the Closure JS Compiler.
# See https://www.npmjs.com/package/closurecompiler
$ cd unpacker
$ npm install google-closure-compiler
$ bash check_js_for_errors.sh
```
