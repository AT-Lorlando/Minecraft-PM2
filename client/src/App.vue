<template>
  <img alt="Vue logo" src="./assets/logo.png">
  <!-- A form to send command -->
  <form @submit.prevent="sendCommand">
    <input type="text" placeholder="Enter command">
    <button type="submit">Send</button>
  </form>
  <!-- A list of commands -->
  <button v-for="(command, key) in COMMANDS" @click="command" :key="key">
    {{ key }}
  </button>
</template>

<script setup>
import { onMounted } from 'vue';
const axios = require('axios');
const API_URL = 'http://localhost:3002';

const COMMANDS = {
  'start': startServer,
  'stop': stopServer,
  'logs': getLogs,
}

function sendCommand(e) {
  const command = e.target.querySelector('input').value;
  axios.post(API_URL + '/command', { command })
    .then(res => {
      console.log(res);
    })
    .catch(err => {
      console.log(err);
    });
}

function startServer() {
  axios.post(API_URL+'/start')
    .then(res => {
      console.log(res);
  })
  .catch(err => {
    console.log(err);
  });
}

function stopServer() {
  axios.post(API_URL+'/stop')
    .then(res => {
      console.log(res);
  })
  .catch(err => {
    console.log(err);
  });
}

function getLogs() {
  axios.get(API_URL+'/logs')
    .then(res => {
      console.log(res);
  })
  .catch(err => {
    console.log(err);
  });
}

onMounted(() => {
  axios.get(API_URL)
    .then(res => {
      console.log(res);
    })
    .catch(err => {
      console.log(err);
    });
})
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
