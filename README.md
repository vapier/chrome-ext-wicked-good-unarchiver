# ZIP Unpacker extension

This is the ZIP Unpacker extension used in Chrome OS to support reading and
unpacking of zip archives.

## Build steps

First of all you will need [naclports](https://code.google.com/p/naclports/).
See https://code.google.com/p/naclports/wiki/HowTo_Checkout?tm=4

Once done, install the libarchive-fork from third-party of the unpacker
project. Note that you cannot use libarchive nor libarchive-dev packages from
naclports at this moment, as not all patches in the fork are upstreamed.

```
$ cd third-party
$ NACLPORTS_PATH=[path-to-your-naclports] make libarchive-fork
```

Polymer is used for UI. In order to fetch it, in the same directory type:

```
$ NACLPORTS_PATH=[path-to-your-naclports] make polymer
```

Note, that you'll need npm and bower installed in the system.

Build the PNaCl module.

```
$ cd unpacker
$ make  # For Release.
$ make debug_for_tests  # For Debug.
```

In order to use Release / Debug see
[js/background.js](/unpacker/js/background.js) for instructions.

## Steps for obtaining the extention code for releasing on Chrome store

Note, that you need vulcanizer to be installed:

```
$ npm install vulcanize
```

Then you can create the package with:

```
$ cd unpacker
$ make [debug]
```

The package will be available in the release or debug directory.

## Use

Load unpacked extension and open rar / zip archives.

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
