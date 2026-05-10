// ============================================
// BMW in City - Game Script (Non-Module Version)
// Uses global THREE and CANNON from CDN
// ============================================

// ============================================
// GLOBAL VARIABLES & CONFIGURATION
// ============================================
const CONFIG = {
    gravity: -9.82,
    physicsStep: 1 / 60,

    carMass: 1500,
    wheelMass: 20,
    maxSteerVal: 0.5,
    maxForce: 2000,
    brakeForce: 100,
    handBrakeForce: 500,

    gears: {
        'R': -3.5,
        '1': 3.8,
        '2': 2.2,
        '3': 1.5,
        '4': 1.1,
        '5': 0.8,
        '6': 0.6
    },
    finalDrive: 3.46,

    maxRPM: 8000,
    idleRPM: 800,
    redlineRPM: 7500,

    cameraDistance: 8,
    cameraHeight: 3,
    cameraSmoothness: 0.1,

    audioEnabled: true,
    masterVolume: 0.7,

    shadowMapSize: 2048,
    fogDensity: 0.002,

    maxParticles: 100,
    cullingDistance: 200
};

const state = {
    isPlaying: false,
    isMobile: false,
    cameraMode: 'chase',
    speed: 0,
    rpm: CONFIG.idleRPM,
    gear: 'N',
    gearIndex: 0,
    steering: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    isDrifting: false,
    driftAngle: 0,
    time: 0,
    fps: 60,
    frameCount: 0
};

const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    handbrake: false
};

// Three.js Objects
let scene, camera, renderer;
let carMesh, wheels = [];
let particleSystem;

// Cannon.js Objects
let world, carBody, vehicle;
let physicsMaterial, wheelMaterial;

// Audio
let audioContext, engineSource, engineGain;

// Minimap
let minimapCanvas, minimapCtx;

// ============================================
// DEVICE DETECTION
// ============================================
function detectDevice() {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    state.isMobile = isTouchDevice || isMobileUA || window.innerWidth < 768;

    const deviceInfo = document.getElementById('deviceInfo');
    if (state.isMobile) {
        deviceInfo.textContent = 'تم اكتشاف: هاتف/تابلت - ستظهر أزرار التحكم على الشاشة';
        deviceInfo.style.background = 'rgba(46, 204, 113, 0.2)';
    } else {
        deviceInfo.textContent = 'تم اكتشاف: كمبيوتر - استخدم لوحة المفاتيح للتحكم';
        deviceInfo.style.background = 'rgba(52, 152, 219, 0.2)';
    }
}

// ============================================
// ERROR HANDLING
// ============================================
function showError(msg) {
    const errorDiv = document.getElementById('loadingError');
    errorDiv.textContent = 'خطأ: ' + msg;
    errorDiv.style.display = 'block';
    document.getElementById('loadingText').textContent = 'فشل التحميل';
    document.querySelector('.loading-spinner').style.borderTopColor = '#e74c3c';
    console.error(msg);
}

function updateLoading(percent, text) {
    document.getElementById('loadingBar').style.width = percent + '%';
    document.getElementById('loadingText').textContent = text;
}

// ============================================
// INITIALIZATION
// ============================================
function init() {
    try {
        detectDevice();

        // Check if libraries loaded
        if (typeof THREE === 'undefined') {
            showError('Three.js لم يتم تحميله. تأكد من الاتصال بالإنترنت.');
            return;
        }
        if (typeof CANNON === 'undefined') {
            showError('Cannon.js لم يتم تحميله. تأكد من الاتصال بالإنترنت.');
            return;
        }

        updateLoading(10, 'جاري تهيئة المحرك ثلاثي الأبعاد...');

        initThreeJS();

        updateLoading(30, 'جاري تهيئة محرك الفيزياء...');
        initPhysics();

        updateLoading(50, 'جاري تحميل الأصوات...');
        initAudio();

        updateLoading(70, 'جاري إعداد العالم...');
        setupWorld();
        setupCar();
        setupMinimap();
        setupEventListeners();

        updateLoading(100, 'جاهز!');

        // Hide loading and show instructions
        setTimeout(() => {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('instructions').style.display = 'flex';
        }, 500);

    } catch (e) {
        showError(e.message);
        console.error(e);
    }
}

// ============================================
// THREE.JS SETUP
// ============================================
function initThreeJS() {
    const container = document.getElementById('gameContainer');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.FogExp2(0x111111, CONFIG.fogDensity);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = CONFIG.shadowMapSize;
    sunLight.shadow.mapSize.height = CONFIG.shadowMapSize;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x362d1d, 0.4);
    scene.add(hemiLight);
}

// ============================================
// PHYSICS SETUP (Cannon.js)
// ============================================
function initPhysics() {
    world = new CANNON.World();
    world.gravity.set(0, CONFIG.gravity, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10;

    physicsMaterial = new CANNON.Material('physics');
    wheelMaterial = new CANNON.Material('wheel');

    const physicsWheelContact = new CANNON.ContactMaterial(
        physicsMaterial, wheelMaterial,
        { friction: 0.3, restitution: 0 }
    );
    world.addContactMaterial(physicsWheelContact);
}

// ============================================
// AUDIO SETUP
// ============================================
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        engineGain = audioContext.createGain();
        engineGain.gain.value = 0;
        engineGain.connect(audioContext.destination);
    } catch (e) {
        console.warn('Web Audio API not supported');
        CONFIG.audioEnabled = false;
    }
}

function startEngineSound() {
    if (!CONFIG.audioEnabled || !audioContext || engineSource) return;

    engineSource = audioContext.createOscillator();
    engineSource.type = 'sawtooth';
    engineSource.frequency.value = 50;
    engineSource.connect(engineGain);
    engineSource.start();
}

function updateEngineSound() {
    if (!CONFIG.audioEnabled || !audioContext || !engineSource) return;

    const rpmRatio = (state.rpm - CONFIG.idleRPM) / (CONFIG.maxRPM - CONFIG.idleRPM);
    const targetVolume = state.throttle > 0 ? 0.3 + (rpmRatio * 0.4) : 0.1;
    engineGain.gain.setTargetAtTime(targetVolume, audioContext.currentTime, 0.1);

    const baseFreq = 50;
    const targetFreq = baseFreq + (rpmRatio * 150);
    engineSource.frequency.setTargetAtTime(targetFreq, audioContext.currentTime, 0.05);
}

// ============================================
// PROCEDURAL CAR
// ============================================
function createProceduralCar() {
    const carGroup = new THREE.Group();

    // Car body
    const bodyGeometry = new THREE.BoxGeometry(2, 0.8, 4.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a, metalness: 0.8, roughness: 0.2 
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    body.castShadow = true;
    carGroup.add(body);

    // Car top
    const topGeometry = new THREE.BoxGeometry(1.8, 0.6, 2.5);
    const top = new THREE.Mesh(topGeometry, bodyMaterial);
    top.position.y = 1.3;
    top.position.z = -0.3;
    top.castShadow = true;
    carGroup.add(top);

    // Windows
    const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.7
    });
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.1), windowMaterial);
    windshield.position.set(0, 1.3, 0.95);
    windshield.rotation.x = -0.2;
    carGroup.add(windshield);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 32);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });

    const wheelPositions = [
        [-1, 0.4, 1.5], [1, 0.4, 1.5],
        [-1, 0.4, -1.5], [1, 0.4, -1.5]
    ];

    wheelPositions.forEach((pos, i) => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        wheel.castShadow = true;
        wheels.push(wheel);
        carGroup.add(wheel);
    });

    // Headlights
    const headlightGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.1);
    const headlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 2
    });
    const hl1 = new THREE.Mesh(headlightGeometry, headlightMaterial);
    hl1.position.set(-0.6, 0.7, 2.25);
    carGroup.add(hl1);
    const hl2 = new THREE.Mesh(headlightGeometry, headlightMaterial);
    hl2.position.set(0.6, 0.7, 2.25);
    carGroup.add(hl2);

    // Taillights
    const taillightMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1
    });
    const tl1 = new THREE.Mesh(headlightGeometry, taillightMaterial);
    tl1.position.set(-0.6, 0.7, -2.25);
    carGroup.add(tl1);
    const tl2 = new THREE.Mesh(headlightGeometry, taillightMaterial);
    tl2.position.set(0.6, 0.7, -2.25);
    carGroup.add(tl2);

    // BMW Logo
    const logoGeometry = new THREE.CircleGeometry(0.15, 32);
    const logoMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0 });
    const logo = new THREE.Mesh(logoGeometry, logoMaterial);
    logo.position.set(0, 0.8, 2.26);
    carGroup.add(logo);

    return carGroup;
}

// ============================================
// PROCEDURAL CITY
// ============================================
function createProceduralCity() {
    const cityGroup = new THREE.Group();

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(500, 500);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    cityGroup.add(ground);

    // Road markings
    const roadMarkingGeometry = new THREE.PlaneGeometry(0.3, 500);
    const roadMarkingMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3
    });
    const centerLine = new THREE.Mesh(roadMarkingGeometry, roadMarkingMaterial);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.y = 0.01;
    cityGroup.add(centerLine);

    // Buildings
    const buildingColors = [0x444444, 0x555555, 0x666666, 0x333333];
    for (let i = 0; i < 50; i++) {
        const width = 5 + Math.random() * 10;
        const height = 10 + Math.random() * 30;
        const depth = 5 + Math.random() * 10;

        const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: buildingColors[Math.floor(Math.random() * buildingColors.length)], roughness: 0.7
        });

        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        const side = Math.random() > 0.5 ? 1 : -1;
        const x = side * (15 + Math.random() * 80);
        const z = (Math.random() - 0.5) * 200;

        building.position.set(x, height / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        cityGroup.add(building);

        const shape = new CANNON.Box(new CANNON.Vec3(width/2, height/2, depth/2));
        const body = new CANNON.Body({ mass: 0, material: physicsMaterial });
        body.addShape(shape);
        body.position.set(x, height / 2, z);
        world.addBody(body);
    }

    // Street lights
    for (let i = -100; i <= 100; i += 30) {
        const poleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 8);
        const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });

        [-1, 1].forEach(side => {
            const pole = new THREE.Mesh(poleGeometry, poleMaterial);
            pole.position.set(side * 8, 4, i);
            pole.castShadow = true;
            cityGroup.add(pole);

            const lightGeometry = new THREE.SphereGeometry(0.3);
            const lightMaterial = new THREE.MeshStandardMaterial({
                color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 2
            });
            const bulb = new THREE.Mesh(lightGeometry, lightMaterial);
            bulb.position.set(side * 8, 8, i);
            cityGroup.add(bulb);

            const pointLight = new THREE.PointLight(0xffaa00, 1, 30);
            pointLight.position.set(side * 8, 8, i);
            cityGroup.add(pointLight);
        });
    }

    scene.add(cityGroup);

    // Ground physics
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0, material: physicsMaterial });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
}

// ============================================
// SETUP WORLD
// ============================================
function setupWorld() {
    carMesh = createProceduralCar();
    scene.add(carMesh);
    createProceduralCity();
}

// ============================================
// SETUP CAR PHYSICS (Raycast Vehicle)
// ============================================
function setupCar() {
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.5, 2.25));
    carBody = new CANNON.Body({ mass: CONFIG.carMass, material: physicsMaterial });
    carBody.addShape(chassisShape);
    carBody.position.set(0, 2, 0);
    carBody.angularDamping = 0.5;
    world.addBody(carBody);

    vehicle = new CANNON.RaycastVehicle({
        chassisBody: carBody,
        indexRightAxis: 0,
        indexUpAxis: 1,
        indexForwardAxis: 2
    });

    const wheelOptions = {
        radius: 0.4,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        frictionSlip: 1.4,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
        maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true
    };

    const wheelPositions = [
        [-1, 0, 1.5], [1, 0, 1.5],
        [-1, 0, -1.5], [1, 0, -1.5]
    ];

    wheelPositions.forEach((pos) => {
        wheelOptions.chassisConnectionPointLocal.set(...pos);
        vehicle.addWheel(wheelOptions);
    });

    vehicle.addToWorld(world);

    // Wheel visuals
    vehicle.wheelInfos.forEach((wheel, i) => {
        const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.25, 32);
        const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelMesh.rotation.z = Math.PI / 2;
        wheelMesh.castShadow = true;
        scene.add(wheelMesh);
        wheels.push(wheelMesh);
    });
}

// ============================================
// MINIMAP
// ============================================
function setupMinimap() {
    minimapCanvas = document.getElementById('minimapCanvas');
    minimapCtx = minimapCanvas.getContext('2d');
}

function updateMinimap() {
    if (!minimapCtx || !carBody) return;

    const ctx = minimapCtx;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 20) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
    }
    for (let i = 0; i < h; i += 20) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }

    const carX = w / 2;
    const carY = h / 2;

    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(new THREE.Quaternion(
        carBody.quaternion.x, carBody.quaternion.y, carBody.quaternion.z, carBody.quaternion.w
    ));
    const angle = Math.atan2(forward.x, forward.z);

    ctx.save();
    ctx.translate(carX, carY);
    ctx.rotate(angle);
    ctx.fillStyle = '#0ff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, 6);
    ctx.lineTo(5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText('N', w/2 - 3, 12);
}

// ============================================
// INPUT HANDLING
// ============================================
function setupEventListeners() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
        switch(e.key.toLowerCase()) {
            case 'arrowup': case 'w': input.up = true; break;
            case 'arrowdown': 
                if (e.key === 'ArrowDown') input.down = true;
                break;
            case 's':
                if (!e.ctrlKey && !e.metaKey) shiftGear(-1);
                break;
            case 'arrowleft': case 'a': input.left = true; break;
            case 'arrowright': case 'd': input.right = true; break;
            case 'z': shiftGear(1); break;
            case 'r': setGear('R'); break;
            case ' ': input.handbrake = true; e.preventDefault(); break;
            case 'c': cycleCameraMode(); break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch(e.key.toLowerCase()) {
            case 'arrowup': case 'w': input.up = false; break;
            case 'arrowdown': case 's': input.down = false; break;
            case 'arrowleft': case 'a': input.left = false; break;
            case 'arrowright': case 'd': input.right = false; break;
            case ' ': input.handbrake = false; break;
        }
    });

    // Mobile Controls
    if (state.isMobile) setupMobileControls();

    window.addEventListener('resize', onWindowResize);
    document.getElementById('startBtn').addEventListener('click', startGame);
}

function setupMobileControls() {
    const setupBtn = (id, onStart, onEnd) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        const start = (e) => { e.preventDefault(); onStart(); };
        const end = (e) => { e.preventDefault(); onEnd(); };

        btn.addEventListener('touchstart', start);
        btn.addEventListener('touchend', end);
        btn.addEventListener('mousedown', () => onStart());
        btn.addEventListener('mouseup', () => onEnd());
        btn.addEventListener('mouseleave', () => onEnd());
    };

    setupBtn('mobileGas', () => input.up = true, () => input.up = false);
    setupBtn('mobileBrake', () => input.down = true, () => input.down = false);
    setupBtn('mobileLeft', () => input.left = true, () => input.left = false);
    setupBtn('mobileRight', () => input.right = true, () => input.right = false);

    document.getElementById('mobileShiftUp').addEventListener('click', () => shiftGear(1));
    document.getElementById('mobileShiftDown').addEventListener('click', () => shiftGear(-1));
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// GEAR SYSTEM
// ============================================
const gearOrder = ['R', 'N', '1', '2', '3', '4', '5', '6'];

function shiftGear(direction) {
    const currentIndex = gearOrder.indexOf(state.gear);
    const newIndex = Math.max(0, Math.min(gearOrder.length - 1, currentIndex + direction));
    if (newIndex !== currentIndex) setGear(gearOrder[newIndex]);
}

function setGear(gear) {
    state.gear = gear;
    state.gearIndex = gearOrder.indexOf(gear);

    const gearDisplay = document.getElementById('gearDisplay');
    gearDisplay.textContent = gear;
    gearDisplay.style.transform = 'scale(1.3)';
    setTimeout(() => { gearDisplay.style.transform = 'scale(1)'; }, 200);

    document.getElementById('gearStat').textContent = gear;
}

// ============================================
// CAMERA MODES
// ============================================
const cameraModes = ['chase', 'hood', 'cockpit'];
let currentCameraIndex = 0;

function cycleCameraMode() {
    currentCameraIndex = (currentCameraIndex + 1) % cameraModes.length;
    state.cameraMode = cameraModes[currentCameraIndex];
}

function updateCamera() {
    if (!carBody) return;

    const carPosition = new THREE.Vector3(carBody.position.x, carBody.position.y, carBody.position.z);
    const carQuaternion = new THREE.Quaternion(
        carBody.quaternion.x, carBody.quaternion.y, carBody.quaternion.z, carBody.quaternion.w
    );

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuaternion);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(carQuaternion);

    let targetPosition, targetLookAt;

    switch(state.cameraMode) {
        case 'chase':
            targetPosition = carPosition.clone()
                .add(forward.clone().multiplyScalar(-CONFIG.cameraDistance))
                .add(up.clone().multiplyScalar(CONFIG.cameraHeight))
                .add(right.clone().multiplyScalar(state.steering * 2));
            targetLookAt = carPosition.clone().add(forward.clone().multiplyScalar(5));
            break;
        case 'hood':
            targetPosition = carPosition.clone()
                .add(forward.clone().multiplyScalar(1.5))
                .add(up.clone().multiplyScalar(1.2));
            targetLookAt = carPosition.clone().add(forward.clone().multiplyScalar(20));
            break;
        case 'cockpit':
            targetPosition = carPosition.clone()
                .add(up.clone().multiplyScalar(1.0))
                .add(forward.clone().multiplyScalar(0.3));
            targetLookAt = carPosition.clone().add(forward.clone().multiplyScalar(50));
            break;
    }

    camera.position.lerp(targetPosition, CONFIG.cameraSmoothness);
    camera.lookAt(targetLookAt || carPosition);
}

// ============================================
// GAME LOGIC
// ============================================
function startGame() {
    document.getElementById('instructions').style.display = 'none';
    document.getElementById('hud').style.display = 'block';

    state.isPlaying = true;
    startEngineSound();

    // Resume audio context if suspended
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }

    gameLoop();
}

function updatePhysics() {
    if (!vehicle) return;

    // Steering
    const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    state.steering = THREE.MathUtils.lerp(state.steering, steerInput * CONFIG.maxSteerVal, 0.1);

    vehicle.setSteeringValue(state.steering, 0);
    vehicle.setSteeringValue(state.steering, 1);

    // Throttle and Brake
    let engineForce = 0;
    let brakeForce = 0;

    if (state.gear === 'N') {
        state.throttle = 0;
        state.brake = input.down ? 1 : 0;
        brakeForce = state.brake * CONFIG.brakeForce;
    } else if (state.gear === 'R') {
        if (input.up) {
            state.throttle = 1;
            state.brake = 0;
            engineForce = -CONFIG.maxForce * 0.5;
        } else if (input.down) {
            state.throttle = 0;
            state.brake = 1;
            brakeForce = CONFIG.brakeForce;
        } else {
            state.throttle = 0;
            state.brake = 0;
        }
    } else {
        const gearRatio = CONFIG.gears[state.gear] || 1;

        if (input.up) {
            state.throttle = 1;
            state.brake = 0;
            engineForce = CONFIG.maxForce * gearRatio * CONFIG.finalDrive;
        } else if (input.down) {
            state.throttle = 0;
            state.brake = 1;
            brakeForce = CONFIG.brakeForce;
        } else {
            state.throttle = 0;
            state.brake = 0;
            brakeForce = 10; // Engine braking
        }
    }

    // Handbrake
    if (input.handbrake) {
        brakeForce = Math.max(brakeForce, CONFIG.handBrakeForce);
        vehicle.setBrake(brakeForce, 2);
        vehicle.setBrake(brakeForce, 3);
    } else {
        vehicle.applyEngineForce(engineForce, 2);
        vehicle.applyEngineForce(engineForce, 3);

        vehicle.setBrake(brakeForce, 0);
        vehicle.setBrake(brakeForce, 1);
        vehicle.setBrake(brakeForce, 2);
        vehicle.setBrake(brakeForce, 3);
    }

    // Update wheel visuals
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        vehicle.updateWheelTransform(i);
        const transform = vehicle.wheelInfos[i].worldTransform;

        if (wheels[i]) {
            wheels[i].position.set(transform.position.x, transform.position.y, transform.position.z);
            wheels[i].quaternion.set(
                transform.quaternion.x, transform.quaternion.y,
                transform.quaternion.z, transform.quaternion.w
            );
        }
    }

    // Calculate speed
    const velocity = carBody.velocity;
    state.speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) * 3.6;

    updateRPM();
    detectDrift();
}

function updateRPM() {
    const speedRatio = Math.abs(state.speed) / 250;

    if (state.throttle > 0 && state.gear !== 'N') {
        const targetRPM = CONFIG.idleRPM + (speedRatio * (CONFIG.maxRPM - CONFIG.idleRPM));
        state.rpm = THREE.MathUtils.lerp(state.rpm, targetRPM, 0.05);
        if (state.rpm > CONFIG.redlineRPM) state.rpm = CONFIG.redlineRPM;
    } else {
        state.rpm = THREE.MathUtils.lerp(state.rpm, CONFIG.idleRPM, 0.03);
    }

    updateEngineSound();
}

function detectDrift() {
    if (!carBody) return;

    const velocity = new THREE.Vector3(carBody.velocity.x, 0, carBody.velocity.z);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(
        carBody.quaternion.x, carBody.quaternion.y, carBody.quaternion.z, carBody.quaternion.w
    ));

    if (velocity.length() > 5) {
        const driftAngle = Math.abs(Math.atan2(
            velocity.x * forward.z - velocity.z * forward.x,
            velocity.x * forward.x + velocity.z * forward.z
        ));

        state.driftAngle = driftAngle;
        state.isDrifting = driftAngle > 0.3 && state.speed > 20;
    } else {
        state.isDrifting = false;
    }

    const indicator = document.getElementById('driftIndicator');
    if (state.isDrifting) indicator.classList.add('active');
    else indicator.classList.remove('active');
}

function updateHUD() {
    document.getElementById('speedDisplay').textContent = Math.floor(state.speed);
    document.getElementById('speedStat').textContent = Math.floor(state.speed);

    const rpmPercent = (state.rpm / CONFIG.maxRPM) * 100;
    document.getElementById('rpmBar').style.width = rpmPercent + '%';
    document.getElementById('rpmStat').textContent = Math.floor(state.rpm);

    if (carBody) {
        document.getElementById('posX').textContent = Math.floor(carBody.position.x);
        document.getElementById('posZ').textContent = Math.floor(carBody.position.z);
    }

    document.getElementById('fps').textContent = Math.floor(state.fps);
}

// ============================================
// GAME LOOP
// ============================================
let lastTime = 0;
let frameCounter = 0;
let lastFpsTime = 0;

function gameLoop(time = 0) {
    if (!state.isPlaying) return;

    requestAnimationFrame(gameLoop);

    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    frameCounter++;
    if (time - lastFpsTime >= 1000) {
        state.fps = frameCounter;
        frameCounter = 0;
        lastFpsTime = time;
    }

    world.step(CONFIG.physicsStep);
    updatePhysics();

    if (carMesh && carBody) {
        carMesh.position.set(carBody.position.x, carBody.position.y - 0.3, carBody.position.z);
        carMesh.quaternion.set(
            carBody.quaternion.x, carBody.quaternion.y,
            carBody.quaternion.z, carBody.quaternion.w
        );
    }

    updateCamera();
    updateMinimap();
    updateHUD();

    state.time += delta;

    renderer.render(scene, camera);
}

// ============================================
// START
// ============================================
// Wait for DOM and libraries to load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
