#!/bin/bash
rm -rf target
mkdir -p target/coverage

libs=(
    "lib"
    "util"
)

for ix in ${!libs[*]}
do
    jscoverage ${libs[$ix]} target/coverage/${libs[$ix]}
done

cp -r node_modules target/coverage
cp -r config target/coverage
cp -r test target/coverage
cp package.json target/coverage
cp xunit-html-cov-config.json target/coverage

XUNIT_HTML_COV_CONFIG=../../../xunit-html-cov-config.json target/coverage/node_modules/mocha/bin/_mocha target/coverage/test/*_test.js --ignore-leaks -t 20000 --reporter xunit-html-cov