import {readFileSync} from 'node:fs';
import {buildSite} from '../static/build.js';
import {auditStatic} from './static-audit.js';
const site=buildSite(JSON.parse(readFileSync('generated/catalog.json','utf8')),{baseUrl:'https://example.invalid/'});
console.log('Static Lighthouse',JSON.stringify(await auditStatic(site)));
