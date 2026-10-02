'use strict';

// Front door content. Tile icons are plain png files dropped in public/img
const TILES = [
  {
    id: 'intranex',
    name: 'Intranex',
    icon: 'intranex.png',
    status: 'vpn',
    note: 'Internal workspace',
  },
  {
    id: 'bls-hosting',
    name: 'BLS Hosting',
    icon: 'bls-hosting.png',
    status: 'open',
    note: 'Bot hosting panel',
  },
  {
    id: 'myorder',
    name: 'MyOrder',
    icon: 'myorder.png',
    status: 'vpn',
    note: 'Order desk',
  },
  {
    id: 'myspace',
    name: 'MySpace',
    icon: 'myspace.png',
    status: 'vpn',
    note: 'Personal space',
  },
];

const CONTACTS = [
  { name: 'Net', discord: 'mlsys', email: 'none' },
  { name: 'Folded', discord: '95m2', email: 'sydhsider@hotmail.com' },
  { name: 'Eyes', discord: '4v9d', email: 'none' },
];

const VPN_MESSAGE = 'BLS VPN Required';
const NOTICE = 'Internal service  dev only';

module.exports = { TILES, CONTACTS, VPN_MESSAGE, NOTICE };
