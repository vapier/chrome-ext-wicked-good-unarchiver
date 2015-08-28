#!/bin/bash

PATH_TO_COMPILER=node_modules/google-closure-compiler/compiler.jar
PATH_TO_EXTERNS_CHROME=node_modules/google-closure-compiler/contrib/externs/chrome_extensions.js

java -jar $PATH_TO_COMPILER \
  --checks-only --language_in=ECMASCRIPT5  --warning_level=VERBOSE \
  --externs=externs_js/polymer.js --externs=$PATH_TO_EXTERNS_CHROME \
  --externs=externs_js/chrome.js \
  js/unpacker.js js/*.js
