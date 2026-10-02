'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const config = require('../config');

let lastCpu = cpuSnapshot();
let cpuPercent = 0;

function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const [kind, value] of Object.entries(cpu.times)) {
      total += value;
      if (kind === 'idle') idle += value;
    }
  }
  return { idle, total };
}

function sampleCpu() {
  const now = cpuSnapshot();
  const idleDelta = now.idle - lastCpu.idle;
  const totalDelta = now.total - lastCpu.total;
  lastCpu = now;
  if (totalDelta > 0) cpuPercent = Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
  return cpuPercent;
}

const cpuTimer = setInterval(sampleCpu, 2000);
cpuTimer.unref();

function diskInfo() {
  const target = config.isWindows ? path.parse(config.dirs.root).root : config.dirs.root;
  try {
    const stat = fs.statfsSync(target);
    const total = stat.blocks * stat.bsize;
    const free = stat.bavail * stat.bsize;
    return { drive: target, totalBytes: total, freeBytes: free, usedBytes: total - free };
  } catch {
    return { drive: target, totalBytes: 0, freeBytes: 0, usedBytes: 0 };
  }
}

function hostStats() {
  const totalMb = Math.floor(os.totalmem() / 1048576);
  const freeMb = Math.floor(os.freemem() / 1048576);
  const disk = diskInfo();
  return {
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    nodeVersion: process.versions.node,
    uptimeSeconds: Math.floor(os.uptime()),
    panelUptimeSeconds: Math.floor(process.uptime()),
    cpuModel: (os.cpus()[0] && os.cpus()[0].model) || 'unknown',
    cpuCount: os.cpus().length,
    cpuPercent,
    loadAverage: os.loadavg().map((n) => Math.round(n * 100) / 100),
    ram: {
      totalMb,
      freeMb,
      usedMb: totalMb - freeMb,
      reserveMb: config.ramReserveMb,
      poolMb: config.ramPoolMb,
    },
    disk,
  };
}

// Resident memory for a set of pids  one external call per sample at most
function processMemory(pids) {
  const list = pids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!list.length) return Promise.resolve({});

  if (!config.isWindows) {
    const out = {};
    for (const pid of list) {
      try {
        const statm = fs.readFileSync(`/proc/${pid}/statm`, 'utf8').split(' ');
        out[pid] = Number(statm[1]) * 4096;
      } catch {
        out[pid] = 0;
      }
    }
    return Promise.resolve(out);
  }

  return new Promise((resolve) => {
    const script = `Get-Process -Id ${list.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id);$($_.WorkingSet64)" }`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => {
        const out = {};
        if (!err && stdout) {
          for (const line of String(stdout).split(/\r?\n/)) {
            const [pid, bytes] = line.trim().split(';');
            if (pid && bytes) out[Number(pid)] = Number(bytes);
          }
        }
        resolve(out);
      }
    );
  });
}

module.exports = { hostStats, diskInfo, processMemory, sampleCpu };
