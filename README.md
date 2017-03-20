# ZIP Unpacker extension

This is the ZIP Unpacker extension used in Chrome OS to support reading and
unpacking of zip archives.

## Build steps

### NaCl SDK

Since the code is built with [NaCl](https://developer.chrome.com/native-client/),
you'll need its toolchain.

```
$ cd third-party
$ make nacl_sdk
```

### Webports (a.k.a. NaCl ports)

We'll use libraries from [webports](https://chromium.googlesource.com/webports/).

```
$ cd third-party
$ make depot_tools
$ make webports
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
$ npm install --save-dev \
  karma karma-chrome-launcher karma-cli \
  mocha karma-mocha karma-chai chai karma-sinon sinon

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
