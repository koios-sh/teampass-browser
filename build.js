'use strict';

const fs = require('fs');
const extra = require('fs-extra');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const zaf = require('zip-a-folder');

const DEST = 'teampass-browser';
const DEFAULT = 'manifest_default.json';
const BROWSERS = {
    'Firefox': 'manifest_firefox.json',
    'Chromium': 'manifest_chromium.json',
};

function adjustManifest(manifest) {
    const manifestFile = fs.readFileSync(DEFAULT, 'utf8');
    const data = JSON.parse(manifestFile);
    const browser = manifest.substring(manifest.indexOf('_') + 1, manifest.indexOf('.'));
    var extension = 'zip';
    if (manifest.includes('firefox')) {
        for (const elem in data['icons']) {
            data['icons'][elem] = 'icons/teampass.svg';
        }
        for (const elem in data['browser_action']['default_icon']) {
            data['browser_action']['default_icon'][elem] = 'icons/teampass.svg';
        }
        extension = 'xpi';
    } else if (manifest.includes('chromium')) {
        delete data['applications'];
    }

    fs.writeFileSync(manifest, JSON.stringify(data, null, 4));
    return `teampass-browser_${browser}.${extension}`;
}

async function updateTranslations() {
    console.log('Pulling translations from Transifex, please wait...');
    const { stdout } = await exec('tx pull -af');
    console.log(stdout);
}

(async() => {
    // await updateTranslations();
    fs.copyFileSync(`${DEST}/manifest.json`, `./${DEFAULT}`);

    for (const browser in BROWSERS) {
        console.log(`TeamPass-Browser: Creating extension package for ${browser}`);
        const fileName = adjustManifest(BROWSERS[browser]);
        fs.copyFileSync(BROWSERS[browser], `${DEST}/manifest.json`);
        extra.removeSync(fileName);
        await zaf.zip(DEST, fileName);
        extra.removeSync(BROWSERS[browser]);
        console.log('Done');
    }

    fs.renameSync(DEFAULT, `${DEST}/manifest.json`);
})();
