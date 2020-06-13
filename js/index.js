import * as THREE from './three/build/three.module.js';
import { OrbitControls } from './three/examples/jsm/controls/OrbitControls.js';
import { VRButton } from './three/examples/jsm/webxr/VRButton.js';
import { webAudioTouchUnlock } from './web-audio-touch-unlock/dist/index.js';
import WebXRPolyfill from './webxr-polyfill/build/webxr-polyfill.module.js';

let container, camera, controls, renderer, scene;
let particles, count = 0;
const SEPARATION = 0.07, AMOUNTX = 500, AMOUNTZ = 500;
const baseline = 1.5, maxY = 5, activeArea = 8;
let col;

let audioCtx, analyser;

init();

function getFullscreenButton ( renderer ) {

  var button = document.createElement( 'button' );

  button.style.position = 'absolute';
  button.style.cursor = 'pointer';
  button.style.right = '20px';
  button.style.bottom = '20px';
  button.style.width = '110px';
  button.style.padding = '12px 6px';
  button.style.border = '1px solid #fff';
  button.style.borderRadius = '4px';
  button.style.background = 'rgba(0,0,0,0.1)';
  button.style.color = '#fff';
  button.style.font = 'normal 13px sans-serif';
  button.style.textAlign = 'center';
  button.style.opacity = '0.5';
  button.style.outline = 'none';
  button.style.zIndex = '999';
  button.textContent = 'FULL SCREEN';

  button.onmouseenter = function () {

    button.style.opacity = '1.0';

  };

  button.onmouseleave = function () {

    button.style.opacity = '0.5';

  };

  button.onclick = function() {
    if (renderer.domElement.requestFullscreen) {
      renderer.domElement.requestFullscreen();
    } else if (renderer.domElement.webkitRequestFullscreen) {
      renderer.domElement.webkitRequestFullscreen();
    } else if (renderer.domElement.mozRequestFullScreen) {
      renderer.domElement.mozRequestFullScreen();
    }
  };
  return button;
}


function init() {

  const polyfill = new WebXRPolyfill();
  audioCtx = new(window.AudioContext || window.webkitAudioContext)();

  webAudioTouchUnlock(audioCtx)
  .then(function (unlocked) {
      if(unlocked) {
          // AudioContext was unlocked from an explicit user action, sound should start playing now
      } else {
          // There was no need for unlocking, devices other than iOS
      }
  }, function(reason) {
      console.error(reason);
  });

  
  analyser = audioCtx.createAnalyser();
  analyser.smoothingTimeConstant = 0.85;
  
  container = document.querySelector("#scene-container");
  scene = new THREE.Scene();
  scene.background = new THREE.Color("black");
  
  
  initialiseMic();
  createCamera();
  createControls();
  createLights();
  createParticles();
  createRenderer();
  
  renderer.setAnimationLoop(() => {
    render();
  });

  document.body.appendChild( getFullscreenButton( renderer ) );
}

function initialiseMic() {
  let constraints = {
    audio: true,
    video: false
  };
  // get microphone access
  navigator.mediaDevices.getUserMedia(constraints)
    .then(function (stream) {
      // if successful
      console.log("Microphone access allowed")
      const audioSource = audioCtx.createMediaStreamSource(stream);
      audioSource.connect(analyser);
    })
    .catch(function (err) {
      // if unsuccessful
      console.log("Error " + err.message)
    });
}

function getMicData() {
  let bufferLength = analyser.fftSize;
  let dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);
  let maxAmp = 0;
  let largestBin;
  let sumOfAmplitudes = 0;
  for (let i = 0; i < bufferLength; i++) {
    let thisAmp = dataArray[i]; // amplitude of current bin
    if (thisAmp > maxAmp) {
      maxAmp = thisAmp;
      largestBin = i;
      sumOfAmplitudes = sumOfAmplitudes + thisAmp;
    }
  }
  let loudestFreq = largestBin * (audioCtx.sampleRate / bufferLength);
  let averageAmplitude = sumOfAmplitudes / bufferLength;
  return [loudestFreq, averageAmplitude];
}

function createCamera() {
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.set(1, 0, 0);
}

function createControls() {
  controls = new OrbitControls(camera, container);
}

function createLights() {
  const ambientLight = new THREE.HemisphereLight(
    0xddeeff, // bright sky color
    0x202020, // dim ground color
    5, // intensity
  );
  const mainLight = new THREE.DirectionalLight(0xffffff, 5);
  mainLight.position.set(10, 10, 10);
  scene.add(ambientLight, mainLight);
}

function createParticles() {
  let numParticles = AMOUNTX * AMOUNTZ;
  let positions = new Float32Array(numParticles * 3);
  let scales = new Float32Array(numParticles);
  let i = 0, j = 0;

  for (let ix = 0; ix < AMOUNTX; ix++) {
    for (let iz = 0; iz < AMOUNTZ; iz++) {
      positions[i] = ix * SEPARATION - ((AMOUNTX * SEPARATION) / 2); // x
      positions[i + 1] = 0; // y
      positions[i + 2] = iz * SEPARATION - ((AMOUNTZ * SEPARATION) / 2); // z
      scales[j] = 0.1;
      i += 3;
      j++;
    }
  }

  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

  let material = new THREE.ShaderMaterial({
    uniforms: {
      color: {
        value: new THREE.Color(`hsl(${col}, 50%, 80%)`)
      },
      transparent: true,
    },
    vertexShader: document.getElementById('vertexshader').textContent,
    fragmentShader: document.getElementById('fragmentshader').textContent
  });
  
  material.opacity = 0.5;
  particles = new THREE.Points(geometry, material);
  scene.add(particles);
}

function createRenderer() {
  renderer = new THREE.WebGLRenderer({
    antialias: true
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  
  container.appendChild(renderer.domElement);
  
  document.body.appendChild(VRButton.createButton(renderer));
}

function render() {
   
  let micData = getMicData();
  let loudestFreq = micData[0];
  let averageAmplitude = micData[1];

  let minAmplitude = 0.15;
  let amplitude;

  if (averageAmplitude < minAmplitude) {
    amplitude = 0;
  } else {
    amplitude = averageAmplitude - minAmplitude;
  }

  let positions = particles.geometry.attributes.position.array;
  let scales = particles.geometry.attributes.scale.array;
  let centreX = 0, centreZ = 0;
  let maxRadius = amplitude * activeArea;
  let i = 0, j = 0;

  for (let ix = 0; ix < AMOUNTX; ix++) {
    for (let iz = 0; iz < AMOUNTZ; iz++) {
      
      let xPosition = positions[i];
      let zPosition = positions[i + 2];
      let distanceFromCentre = distance(xPosition, zPosition, centreX, centreZ);
      
      if (distanceFromCentre < maxRadius) {
        let scaledDistanceFromCentre = mapToValue(distanceFromCentre, 0, maxRadius, 0, Math.PI);
       
        if (loudestFreq > 600) {
          positions[i + 1] = baseline + (Math.cos(scaledDistanceFromCentre) + 1) * maxY * amplitude;
        } else {
          positions[i + 1] = baseline + (Math.cos(scaledDistanceFromCentre) + 1) * maxY * amplitude *
            (-1);
        }

      } else {
        let rippleStart = distanceFromCentre - maxRadius;
        let rippleWavelength = 0.5;
        let scaledRipple = mapToValue(rippleStart, 0, rippleWavelength, 0, Math.PI);
        let rippleHeight = 0.5 * averageAmplitude;
        positions[i + 1] = baseline + Math.sin(scaledRipple - count) * rippleHeight;
        count += 0.000001;
      }

      col = mapToValue(positions[i + 1], -maxY, maxY, 0, 360);

      scales[j] = 0.02;
      i += 3;
      j++;
    }
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.scale.needsUpdate = true;
  particles.material.uniforms.color.needsUpdate = true;
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function distance(x1, z1, x2, z2) {
  return (Math.sqrt(((x1 - x2) * (x1 - x2)) + ((z1 - z2) * (z1 - z2))));
}

function mapToValue(num, value1Min, value1Max, value2Min, value2Max) {
  return (((num - value1Min) / (value1Max - value1Min)) * (value2Max - value2Min) + value2Min)
}
window.addEventListener("resize", onWindowResize);