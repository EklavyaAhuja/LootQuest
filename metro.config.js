const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const blockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [];

config.resolver.blockList = [
  ...blockList,
  /fgf-backend[\/\\]/,
];

module.exports = config;
