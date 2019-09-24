# TeamPass-Browser
Browser extension for [TeamPass](https://teampass.net/) with Http Rest API.

Based on [keepassxreboot](https://github.com/keepassxreboot/)'s [KeePassXC-Browser](https://github.com/keepassxreboot/keepassxc-browser).

## Download and use

This browser extension was first supported in Teampass 2.1.27 (release end of 2018), in general it is advised to only use the latest available release.

1. replace <YourTeamPassServerRoot>/api/functions.php
           <YourTeamPassServerRoot>/api/index.php
   with included one which only support user's apiKey.
2. Install extension
3. Fill Server Information

## How it works

TeamPass-Browser communicates with TeamPass through customized http rest api. 

## Protocol

The details about the messaging protocol used with the browser extension and TeamPass can be found [here](teampass-protocol.md).
