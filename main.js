import * as THREE from 'three';

// --- State Management ---
const state = {
    isFormed: false, // Have we clicked "Open Sky"?
    messages: [], // Will hold JSON data
    openedCount: 0,
    openedIndices: new Set(),
    hoveredIndex: null,
    currentMsgIndex: -1 // Track the currently open message
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
    btnNext: document.getElementById('btn-next'),
    btnPrev: document.getElementById('btn-prev'),
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
// Limit Pixel Ratio for performance on high-res mobile screens
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Raycaster
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 1.5; // Slightly larger for better mobile tap
const pointer = new THREE.Vector2();

// --- Objects ---
let msgParticles, bgParticles; 
let msgGeometry, bgGeometry;
let highlightSphere; // The selected star glow
let hoverStar;       // The hover effect glow

// Performance Check
const isMobile = window.innerWidth < 768;
const TOTAL_PARTICLES = isMobile ? 1500 : 2500; // Reduce particles on mobile

// Arrays 
const msgPositions = [];
const msgTargetPositions = [];
const msgStartPositions = [];
const msgColors = [];
// Background Arrays
const bgPositions = [];
const bgTargetPositions = [];
const bgStartPositions = [];
const bgColors = [];

// --- Utility Functions ---

function createMessageStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Solid white core
    ctx.beginPath();
    ctx.arc(32, 32, 12, 0, Math.PI * 2); 
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Soft Glow
    const gradient = ctx.createRadialGradient(32, 32, 12, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    
    return new THREE.CanvasTexture(canvas);
}

function createBgStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
}

function getHeartPosition(t, scale = 0.35) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const z = (Math.random() - 0.5) * 4; 
    return new THREE.Vector3(x * scale, y * scale, z);
}

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
        // Appended ?v=2 to force cache refresh
        const response = await fetch('./data/messages.json?v=2');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        state.messages = data.messages;
        state.finalPhrase = data.finalPhrase;
    } catch (error) {
        console.warn("Could not load messages. Using dummy data.", error);
        state.messages = [{name: "Sandra", text: "Mensaje de prueba", tone: "fuerza"}];
    }

    const messageCount = state.messages.length;

    // 2. Setup Particles
    for (let i = 0; i < TOTAL_PARTICLES; i++) {
        
        // Random Sphere Distribution
        const r = 10 + Math.random() * 20; 
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        const sx = r * Math.sin(phi) * Math.cos(theta);
        const sy = r * Math.sin(phi) * Math.sin(theta);
        const sz = r * Math.cos(phi);

        if (i < messageCount) {
            // MESSAGE STAR
            msgStartPositions.push(sx, sy, sz);
            msgPositions.push(sx, sy, sz);

            // Target: Heart Outline
            const t = (i / messageCount) * Math.PI * 2;
            const vec = getHeartPosition(t);
            const tx = vec.x + (Math.random() - 0.5) * 0.2;
            const ty = vec.y + (Math.random() - 0.5) * 0.2;
            const tz = vec.z;
            msgTargetPositions.push(tx, ty, tz);

            const msg = state.messages[i];
            const color = getColorForTone(msg.tone || 'cariño');
            msgColors.push(color.r, color.g, color.b);

        } else {
            // BACKGROUND STAR
            bgStartPositions.push(sx, sy, sz);
            bgPositions.push(sx, sy, sz);

            // Target: Cloud around heart
            const t = Math.random() * Math.PI * 2;
            const vec = getHeartPosition(t, 0.4 + Math.random() * 0.3);
            const tx = vec.x * 1.5 + (Math.random() - 0.5) * 15;
            const ty = vec.y * 1.5 + (Math.random() - 0.5) * 15;
            const tz = (Math.random() - 0.5) * 20;
            bgTargetPositions.push(tx, ty, tz);

            const color = new THREE.Color();
            color.setHSL(0.6, 0.2, 0.6 + Math.random() * 0.4); 
            bgColors.push(color.r, color.g, color.b);
        }
    }

    // Interactive System
    msgGeometry = new THREE.BufferGeometry();
    msgGeometry.setAttribute('position', new THREE.Float32BufferAttribute(msgPositions, 3));
    msgGeometry.setAttribute('color', new THREE.Float32BufferAttribute(msgColors, 3));

    const msgMaterial = new THREE.PointsMaterial({
        size: 3.5, 
        vertexColors: true,
        map: createMessageStarTexture(),
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });
    msgParticles = new THREE.Points(msgGeometry, msgMaterial);
    scene.add(msgParticles);

    // Decorative System
    bgGeometry = new THREE.BufferGeometry();
    bgGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bgPositions, 3));
    bgGeometry.setAttribute('color', new THREE.Float32BufferAttribute(bgColors, 3));

    const bgMaterial = new THREE.PointsMaterial({
        size: 0.8,
        vertexColors: true,
        map: createBgStarTexture(),
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });
    bgParticles = new THREE.Points(bgGeometry, bgMaterial);
    scene.add(bgParticles);

    // 3. Highlight Sphere (Selected)
    const sphereGeo = new THREE.SphereGeometry(1.0, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    highlightSphere = new THREE.Mesh(sphereGeo, sphereMat);
    highlightSphere.visible = false;
    scene.add(highlightSphere);
    const light = new THREE.PointLight(0xffffff, 2, 10);
    highlightSphere.add(light);

    // 4. Hover Glow (Visual Feedback)
    const hoverTexture = createMessageStarTexture();
    const hoverMat = new THREE.SpriteMaterial({ 
        map: hoverTexture, 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    hoverStar = new THREE.Sprite(hoverMat);
    hoverStar.scale.set(3, 3, 1);
    hoverStar.visible = false;
    scene.add(hoverStar);

    // 5. Events
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('click', onClick);
    dom.btnOpen.addEventListener('click', openSky);
    dom.btnClose.addEventListener('click', closeMessage);
    dom.btnNext.addEventListener('click', onNext);
    dom.btnPrev.addEventListener('click', onPrev);

    animate();
}

// --- Logic ---

function openSky() {
    state.isFormed = true;
    dom.introPanel.classList.replace('visible', 'hidden');
    setTimeout(() => {
        dom.introPanel.style.display = 'none';
        dom.hint.classList.replace('hidden', 'visible');
    }, 600);
}

function closeMessage() {
    dom.msgOverlay.classList.replace('visible', 'hidden');
    highlightSphere.visible = false;
    state.currentMsgIndex = -1;
}

function onNext() {
    if(state.currentMsgIndex === -1) return;
    const nextIndex = (state.currentMsgIndex + 1) % state.messages.length;
    navigateToMessage(nextIndex);
}

function onPrev() {
    if(state.currentMsgIndex === -1) return;
    let prevIndex = state.currentMsgIndex - 1;
    if (prevIndex < 0) prevIndex = state.messages.length - 1;
    navigateToMessage(prevIndex);
}

function navigateToMessage(index) {
    const ix = index * 3;
    const iy = index * 3 + 1;
    const iz = index * 3 + 2;
    const pos = new THREE.Vector3(
        msgTargetPositions[ix],
        msgTargetPositions[iy],
        msgTargetPositions[iz]
    );
    showMessage(index, pos);
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

function checkIntersection() {
    if (!state.isFormed || !msgParticles) return null;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(msgParticles);
    if (intersects.length > 0) {
        intersects.sort((a, b) => a.distanceToRay - b.distanceToRay);
        return intersects[0];
    }
    return null;
}

function onClick(event) {
    if (!state.isFormed) return;
    if (event.target !== dom.canvas) return;

    const hit = checkIntersection();
    if (hit) {
        const index = hit.index;
        if (index < state.messages.length) {
            showMessage(index, hit.point);
        }
    }
}

function showMessage(index, position) {
    state.currentMsgIndex = index;
    const msg = state.messages[index];
    
    dom.msgName.textContent = msg.name;
    dom.msgText.textContent = msg.text;
    dom.msgOverlay.classList.replace('hidden', 'visible');
    
    highlightSphere.position.copy(position);
    highlightSphere.visible = true;
    
    // Hide hover effect when selecting
    hoverStar.visible = false;

    if (!state.openedIndices.has(index)) {
        state.openedIndices.add(index);
        state.openedCount++;
        
        if (state.openedCount === 10 && state.finalPhrase) {
            dom.footerText.textContent = state.finalPhrase;
            dom.footerNotif.classList.remove('hidden');
            dom.footerNotif.classList.add('visible');
            msgParticles.material.size *= 1.1; 
        }
    }
}

// --- Animation ---

function animate() {
    requestAnimationFrame(animate);
    const time = Date.now() * 0.001;
    
    // Interaction Check
    if (state.isFormed) {
        const hit = checkIntersection();
        if (hit) {
            document.body.style.cursor = 'pointer';
            
            // Move hover star to the intersection point (or particle position)
            // Using hit.point is accurate to ray, but using particle position is more stable visually
            // Let's grab exact particle position
            const idx = hit.index * 3;
            hoverStar.position.set(
                msgGeometry.attributes.position.array[idx],
                msgGeometry.attributes.position.array[idx + 1],
                msgGeometry.attributes.position.array[idx + 2]
            );
            
            // Pulse effect
            const scale = 3 + Math.sin(time * 5) * 0.5;
            hoverStar.scale.set(scale, scale, 1);
            
            // Only show if we aren't hovering the currently selected star (if overlay is open)
            if (!highlightSphere.visible || highlightSphere.position.distanceTo(hoverStar.position) > 0.1) {
                hoverStar.visible = true;
            } else {
                hoverStar.visible = false;
            }
            
        } else {
            document.body.style.cursor = 'default';
            hoverStar.visible = false;
        }
    }

    if (msgParticles && bgParticles) {
        // Message Particles Update
        const msgPosAttr = msgGeometry.attributes.position;
        msgParticles.rotation.y += 0.0005;
        
        for (let i = 0; i < msgPosAttr.count; i++) {
            const ix = i * 3;
            const iy = i * 3 + 1;
            const iz = i * 3 + 2;

            let tx, ty, tz;

            if (state.isFormed) {
                tx = msgTargetPositions[ix];
                ty = msgTargetPositions[iy];
                tz = msgTargetPositions[iz];
            } else {
                const tOffset = i * 0.1; 
                const floatScale = 0.25; 
                tx = msgStartPositions[ix] + Math.sin(time * 0.2 + tOffset) * floatScale;
                ty = msgStartPositions[iy] + Math.cos(time * 0.15 + tOffset) * floatScale;
                tz = msgStartPositions[iz] + Math.sin(time * 0.1 + tOffset) * floatScale;
            }

            const k = state.isFormed ? 0.006 : 0.05;
            msgPosAttr.array[ix] += (tx - msgPosAttr.array[ix]) * k;
            msgPosAttr.array[iy] += (ty - msgPosAttr.array[iy]) * k;
            msgPosAttr.array[iz] += (tz - msgPosAttr.array[iz]) * k;
        }
        msgPosAttr.needsUpdate = true;

        // Background Particles Update
        const bgPosAttr = bgGeometry.attributes.position;
        bgParticles.rotation.y += 0.0002;

        for (let i = 0; i < bgPosAttr.count; i++) {
            const ix = i * 3;
            const iy = i * 3 + 1;
            const iz = i * 3 + 2;
            
            let tx, ty, tz;
            if (state.isFormed) {
                tx = bgTargetPositions[ix];
                ty = bgTargetPositions[iy];
                tz = bgTargetPositions[iz];
            } else {
                tx = bgStartPositions[ix];
                ty = bgStartPositions[iy];
                tz = bgStartPositions[iz];
            }

            const driftX = Math.sin(time * 0.1 + i) * 1.5;
            const driftY = Math.cos(time * 0.15 + i) * 1.5;
            const k = 0.01; 
            
            bgPosAttr.array[ix] += (tx + driftX - bgPosAttr.array[ix]) * k;
            bgPosAttr.array[iy] += (ty + driftY - bgPosAttr.array[iy]) * k;
            bgPosAttr.array[iz] += (tz - bgPosAttr.array[iz]) * k;
        }
        bgPosAttr.needsUpdate = true;
    }

    renderer.render(scene, camera);
}

init();