import * as THREE from 'three';

// --- State Management ---
const state = {
    isFormed: false, // Have we clicked "Open Sky"?
    messages: [], // Will hold JSON data
    openedCount: 0,
    openedIndices: new Set(),
    hoveredIndex: null
};

// --- DOM Elements ---
const dom = {
    canvas: document.getElementById('canvas'),
    introPanel: document.getElementById('intro-panel'),
    btnOpen: document.getElementById('btn-open'),
    msgOverlay: document.getElementById('message-overlay'),
    msgName: document.getElementById('msg-name'),
    msgText: document.getElementById('msg-text'),
    btnClose: document.getElementById('btn-close'),
    hint: document.getElementById('interaction-hint'),
    footerNotif: document.getElementById('footer-notification'),
    footerText: document.getElementById('footer-text'),
};

// --- Three.js Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020617);
scene.fog = new THREE.FogExp2(0x020617, 0.02);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 30; // Moved back slightly to see more of the field

const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Raycaster for interaction
const raycaster = new THREE.Raycaster();
// Increased threshold significantly to make clicking easier
raycaster.params.Points.threshold = 1.0; 
const pointer = new THREE.Vector2();

// --- Objects ---
let particles;
let geometry;
let highlightSphere;

// Animation/Transition variables
const PARTICLE_COUNT = 3000; // Increased count for a fuller sky
const positions = [];
const targetPositions = []; // The heart shape
const startPositions = []; // The random sphere
const colors = [];
const sizes = []; // Stored but unused by standard material without shader mod, used for fallback logic

// --- Utility Functions ---

// Generate a brighter, more solid circular texture for particles
function createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; // Higher res
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    // Brighter core
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); 
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// Parametric Heart Function
function getHeartPosition(t, scale = 0.35) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    // Add z-depth for 3D volume
    const z = (Math.random() - 0.5) * 4; 
    return new THREE.Vector3(x * scale, y * scale, z);
}

// Tone to Color mapper
function getColorForTone(tone) {
    switch (tone) {
        case 'cariño': return new THREE.Color(0xffb7b2); // Pinkish
        case 'fuerza': return new THREE.Color(0xa78bfa); // Violet/Blue
        case 'calma': return new THREE.Color(0x7dd3fc); // Light Blue
        case 'humor': return new THREE.Color(0xfde047); // Yellow
        default: return new THREE.Color(0xffffff);
    }
}

// --- Initialization ---

async function init() {
    // 1. Load Data
    try {
        const response = await fetch('./data/messages.json');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        state.messages = data.messages;
        state.finalPhrase = data.finalPhrase;
    } catch (error) {
        console.warn("Could not load messages (local file system? cors?). Using dummy data.", error);
        // Fallback data so the app still works if fetch fails
        state.messages = [
            {name: "Sandra", text: "¡Eres fuerte y valiente! (Mensaje de prueba si no carga el archivo)", tone: "fuerza"},
            {name: "Equipo", text: "Estamos contigo.", tone: "cariño"},
            {name: "Amigos", text: "Todo saldrá bien.", tone: "calma"}
        ];
    }

    // 2. Setup Geometry
    geometry = new THREE.BufferGeometry();
    const messageCount = state.messages.length;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // --- Position Setup ---
        
        // Initial: Random sphere distribution
        // Reduced radius slightly so they are closer to camera initially
        const r = 10 + Math.random() * 25; 
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        const sx = r * Math.sin(phi) * Math.cos(theta);
        const sy = r * Math.sin(phi) * Math.sin(theta);
        const sz = r * Math.cos(phi);

        startPositions.push(sx, sy, sz);
        positions.push(sx, sy, sz); // Current starts at initial

        // Target: Heart Shape (for message particles) or surrounding cloud (fillers)
        let tx, ty, tz;
        
        if (i < messageCount) {
            // It's a message particle -> Place on heart outline
            const t = (i / messageCount) * Math.PI * 2;
            const vec = getHeartPosition(t);
            tx = vec.x + (Math.random() - 0.5) * 0.5;
            ty = vec.y + (Math.random() - 0.5) * 0.5;
            tz = vec.z;
        } else {
            // Filler particle
            const t = Math.random() * Math.PI * 2;
            const vec = getHeartPosition(t, 0.4 + Math.random() * 0.2); 
            tx = vec.x * 1.5 + (Math.random() - 0.5) * 10;
            ty = vec.y * 1.5 + (Math.random() - 0.5) * 10;
            tz = (Math.random() - 0.5) * 15;
        }
        targetPositions.push(tx, ty, tz);

        // --- Color Setup ---
        let color = new THREE.Color(0xffffff);
        
        if (i < messageCount) {
            const msg = state.messages[i];
            const tone = msg.tone || 'cariño';
            color = getColorForTone(tone);
        } else {
            // Background stars
            color.setHSL(0.6, 0.2, 0.5 + Math.random() * 0.5); 
        }

        colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // Standard PointsMaterial
    // Increased size and opacity to ensure visibility
    const material = new THREE.PointsMaterial({
        size: 1.2, // Much bigger default size
        vertexColors: true,
        map: createStarTexture(),
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // 3. Highlight Sphere (for selection)
    const sphereGeo = new THREE.SphereGeometry(0.5, 16, 16); // Slightly bigger highlight
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    highlightSphere = new THREE.Mesh(sphereGeo, sphereMat);
    highlightSphere.visible = false;
    scene.add(highlightSphere);
    
    const light = new THREE.PointLight(0xffffff, 2, 10);
    highlightSphere.add(light);

    // 4. Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('click', onClick);
    dom.btnOpen.addEventListener('click', openSky);
    dom.btnClose.addEventListener('click', closeMessage);

    animate();
}

// --- Interaction Logic ---

function openSky() {
    state.isFormed = true;
    
    // UI Transitions
    dom.introPanel.classList.replace('visible', 'hidden');
    setTimeout(() => {
        dom.introPanel.style.display = 'none'; // Remove from flow
        dom.hint.classList.replace('hidden', 'visible');
    }, 600);
}

function closeMessage() {
    dom.msgOverlay.classList.replace('visible', 'hidden');
    highlightSphere.visible = false;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onClick(event) {
    if (!state.isFormed) return;
    
    if (event.target !== dom.canvas) return;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(particles);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const index = hit.index;

        if (index < state.messages.length) {
            showMessage(index, hit.point);
        }
    }
}

function showMessage(index, position) {
    const msg = state.messages[index];
    
    dom.msgName.textContent = msg.name;
    dom.msgText.textContent = msg.text;
    dom.msgOverlay.classList.replace('hidden', 'visible');
    
    highlightSphere.position.copy(position);
    highlightSphere.visible = true;

    if (!state.openedIndices.has(index)) {
        state.openedIndices.add(index);
        state.openedCount++;
        
        if (state.openedCount === 10 && state.finalPhrase) {
            dom.footerText.textContent = state.finalPhrase;
            dom.footerNotif.classList.replace('hidden', 'visible');
            particles.material.size *= 1.2; // Brighter celebration
        }
    }
}

// --- Animation Loop ---

function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.001;
    const positionsAttribute = geometry.attributes.position;
    
    // Rotation
    particles.rotation.y += 0.0008;
    if (!state.isFormed) {
        particles.rotation.x = Math.sin(time * 0.1) * 0.05;
    } else {
        particles.rotation.x = THREE.MathUtils.lerp(particles.rotation.x, 0, 0.05);
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ix = i * 3;
        const iy = i * 3 + 1;
        const iz = i * 3 + 2;

        let targetX, targetY, targetZ;

        if (state.isFormed) {
            targetX = targetPositions[ix];
            targetY = targetPositions[iy];
            targetZ = targetPositions[iz];
        } else {
            // Idle float
            targetX = startPositions[ix] + Math.sin(time + i) * 0.5;
            targetY = startPositions[iy] + Math.cos(time + i * 0.5) * 0.5;
            targetZ = startPositions[iz] + Math.sin(time * 0.5 + i) * 0.5;
        }

        const lerpFactor = state.isFormed ? 0.03 + (i % 5) * 0.005 : 0.05;

        positionsAttribute.array[ix] += (targetX - positionsAttribute.array[ix]) * lerpFactor;
        positionsAttribute.array[iy] += (targetY - positionsAttribute.array[iy]) * lerpFactor;
        positionsAttribute.array[iz] += (targetZ - positionsAttribute.array[iz]) * lerpFactor;
    }

    positionsAttribute.needsUpdate = true;
    renderer.render(scene, camera);
}

// Start
init();