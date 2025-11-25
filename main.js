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
camera.position.z = 25;

const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Raycaster for interaction
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.5; // Easier to click particles
const pointer = new THREE.Vector2();

// --- Objects ---
let particles;
let geometry;
let highlightSphere;

// Animation/Transition variables
const PARTICLE_COUNT = 2500; // Total stars (messages + fillers)
const positions = [];
const targetPositions = []; // The heart shape
const startPositions = []; // The random sphere
const colors = [];
const sizes = [];
const opacities = []; // To fade in non-message stars differently

// --- Utility Functions ---

// Generate a soft circular texture for particles
function createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
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
        const data = await response.json();
        state.messages = data.messages;
        state.finalPhrase = data.finalPhrase;
    } catch (error) {
        console.error("Could not load messages", error);
        // Fallback dummy data if fetch fails
        state.messages = [
            {name: "Sistema", text: "Error cargando mensajes. Pero te queremos igual.", tone: "fuerza"}
        ];
    }

    // 2. Setup Geometry
    geometry = new THREE.BufferGeometry();
    
    // We create more particles than messages to make the sky full
    // The first N particles correspond to messages. The rest are filler.
    const messageCount = state.messages.length;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // --- Position Setup ---
        
        // Initial: Random sphere distribution
        const r = 15 + Math.random() * 20;
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
            // Distribute evenly along the parametric curve
            const t = (i / messageCount) * Math.PI * 2;
            const vec = getHeartPosition(t);
            // Add a little jitter so they aren't perfectly linear
            tx = vec.x + (Math.random() - 0.5) * 0.5;
            ty = vec.y + (Math.random() - 0.5) * 0.5;
            tz = vec.z;
        } else {
            // Filler particle -> Random cloud around the heart
            // Use rejection sampling or just a gaussian blob
            const t = Math.random() * Math.PI * 2;
            // A looser, bigger heart-ish cloud
            const vec = getHeartPosition(t, 0.4 + Math.random() * 0.2); 
            tx = vec.x * 1.5 + (Math.random() - 0.5) * 10;
            ty = vec.y * 1.5 + (Math.random() - 0.5) * 10;
            tz = (Math.random() - 0.5) * 15;
        }
        targetPositions.push(tx, ty, tz);

        // --- Color & Size Setup ---
        let color = new THREE.Color(0xffffff);
        let size = 0.15;
        
        if (i < messageCount) {
            // Assign tone color from data
            // If data doesn't have tone, pick random
            const msg = state.messages[i];
            const tone = msg.tone || ['cariño', 'fuerza', 'calma'][Math.floor(Math.random()*3)];
            color = getColorForTone(tone);
            size = 0.4 + Math.random() * 0.2; // Messages are bigger
        } else {
            // Background stars are dimmer
            size = 0.1 + Math.random() * 0.15;
            color.setHSL(0.6, 0.2, 0.5 + Math.random() * 0.5); // Bluish whites
        }

        colors.push(color.r, color.g, color.b);
        sizes.push(size);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    
    // Custom shader material for better looking points with size attenuation
    const material = new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        map: createStarTexture(),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // 3. Highlight Sphere (for selection)
    const sphereGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    highlightSphere = new THREE.Mesh(sphereGeo, sphereMat);
    highlightSphere.visible = false;
    scene.add(highlightSphere);
    
    // Add a point light to the highlighted area to make it glow
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
    // Normalize coordinates -1 to 1
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onClick(event) {
    if (!state.isFormed) return;
    
    // Check if we clicked the canvas (and not UI)
    if (event.target !== dom.canvas) return;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(particles);

    if (intersects.length > 0) {
        // Find the closest point that corresponds to a message
        // Since points are sorted by distance to ray, loop until we find a valid message index
        const hit = intersects[0]; // Simplification: just take first hit
        const index = hit.index;

        if (index < state.messages.length) {
            showMessage(index, hit.point);
        }
    }
}

function showMessage(index, position) {
    const msg = state.messages[index];
    
    // Update UI
    dom.msgName.textContent = msg.name;
    dom.msgText.textContent = msg.text;
    dom.msgOverlay.classList.replace('hidden', 'visible');
    
    // Update Scene
    highlightSphere.position.copy(position);
    highlightSphere.visible = true;

    // Logic: Track progress
    if (!state.openedIndices.has(index)) {
        state.openedIndices.add(index);
        state.openedCount++;
        
        // Trigger final phrase if enough read
        if (state.openedCount === 10 && state.finalPhrase) {
            dom.footerText.textContent = state.finalPhrase;
            dom.footerNotif.classList.replace('hidden', 'visible');
            
            // Brighten stars slightly
            particles.material.size *= 1.2;
        }
    }
}

// --- Animation Loop ---

function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.001;
    const positionsAttribute = geometry.attributes.position;
    
    // Gentle rotation of the whole cloud
    particles.rotation.y += 0.0005;
    if (!state.isFormed) {
        particles.rotation.x = Math.sin(time * 0.2) * 0.1;
    } else {
        // Stabilize rotation x when formed
        particles.rotation.x = THREE.MathUtils.lerp(particles.rotation.x, 0, 0.05);
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ix = i * 3;
        const iy = i * 3 + 1;
        const iz = i * 3 + 2;

        let targetX, targetY, targetZ;

        if (state.isFormed) {
            // Move towards heart shape
            targetX = targetPositions[ix];
            targetY = targetPositions[iy];
            targetZ = targetPositions[iz];
        } else {
            // Drift around initial positions
            targetX = startPositions[ix] + Math.sin(time + i) * 0.5;
            targetY = startPositions[iy] + Math.cos(time + i * 0.5) * 0.5;
            targetZ = startPositions[iz] + Math.sin(time * 0.5 + i) * 0.5;
        }

        // Linear interpolation for smooth movement
        // We use a varied lerp factor for organic feel (not everyone moves at same speed)
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