#!/bin/bash
cd cpp
make  # Catch compile errors.
make run 2> /dev/null  # Ignore any output except for tests.
                       # Compile erros are checked above.
