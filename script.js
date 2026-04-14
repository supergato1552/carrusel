const container = document.getElementById('webgl-container');
const glassMenu = document.getElementById('glassMenu');

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const textureLoader = new THREE.TextureLoader();
// Recuerda tener tus imágenes en la misma carpeta
const images = ['gojo.jpg', 'nobara.jpg', 'megumi.jpg', 'itadori.jpg'];
const textures = images.map(img => textureLoader.load(img));

// --- EL SHADER FOTOREALISTA (DESLIZAMIENTO PURO SIN DESVANECER) ---
const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform sampler2D tCurrent;
    uniform sampler2D tNext;
    uniform float uProgress;
    uniform float uDirection; 
    uniform vec2 uResolution;
    uniform vec2 uMenuPos;
    uniform vec2 uMenuSize;
    uniform float uMenuRadius;
    varying vec2 vUv;

    // Función Premium de desenfoque y difracción
    vec3 renderGlass(sampler2D tex, vec2 uv, vec2 distortion, float split, float blur) {
        vec3 color = vec3(0.0);
        float total = 0.0;
        for(float x = -2.0; x <= 2.0; x += 1.0) {
            for(float y = -2.0; y <= 2.0; y += 1.0) {
                vec2 offset = vec2(x, y) * blur;
                float r = texture2D(tex, uv + distortion + offset + vec2(split, 0.0)).r;
                float g = texture2D(tex, uv + distortion + offset).g;
                float b = texture2D(tex, uv + distortion + offset - vec2(split, 0.0)).b;
                color += vec3(r, g, b);
                total += 1.0;
            }
        }
        return color / total;
    }

    void main() {
        vec2 uv = vUv;
        vec2 pixelPos = gl_FragCoord.xy; 
        vec2 dPos = pixelPos - uMenuPos; 
        vec2 halfSize = uMenuSize * 0.5;

        // Matemáticas del cristal
        vec2 q = abs(dPos) - halfSize + uMenuRadius;
        float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uMenuRadius;

        float isInsideMenu = 1.0 - smoothstep(-1.0, 1.0, dist); 
        float isBorder = smoothstep(6.0, 0.0, abs(dist)); 
        float isThinBorder = smoothstep(1.5, 0.0, abs(dist)); 

        vec2 lensDistortion = normalize(dPos) * (length(dPos) / length(halfSize)) * 0.015 * isInsideMenu;
        float rgbSplit = 0.012 * isInsideMenu;
        float blurRadius = 0.0035 * isInsideMenu;

        // NUEVO: Deslizamiento físico completo (se eliminó el multiplicador 0.6)
        vec2 uvCurrent = uv + vec2(uProgress * uDirection, 0.0);
        vec2 uvNext = uv - vec2((1.0 - uProgress) * uDirection, 0.0);

        vec3 col1 = renderGlass(tCurrent, uvCurrent, lensDistortion, rgbSplit, blurRadius);
        vec3 col2 = renderGlass(tNext, uvNext, lensDistortion, rgbSplit, blurRadius);
        
        // NUEVO: Corte limpio espacial en lugar de mezclar opacidades (Adiós desvanecimiento)
        float mask = (uDirection > 0.0) ? step(uv.x, 1.0 - uProgress) : step(uProgress, uv.x);
        vec3 finalColor = mix(col2, col1, mask);

        // Aumento de luz y bordes (Se mantienen intactos para el efecto Liquid Glass)
        finalColor += 0.08 * isInsideMenu;
        
        // Reflejo perimetral de la imagen que esté pasando por debajo
        vec3 baseImageColor = texture2D(tCurrent, uvCurrent).rgb * mask + texture2D(tNext, uvNext).rgb * (1.0 - mask);
        finalColor += baseImageColor * isBorder * 0.7;
        finalColor += vec3(1.0) * isThinBorder * 0.4;

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

const material = new THREE.ShaderMaterial({
    uniforms: {
        tCurrent: { value: textures[0] },
        tNext: { value: textures[1] },
        uProgress: { value: 0 },
        uDirection: { value: 1.0 },
        uResolution: { value: new THREE.Vector2() },
        uMenuPos: { value: new THREE.Vector2() },
        uMenuSize: { value: new THREE.Vector2() },
        uMenuRadius: { value: 40.0 }
    },
    vertexShader,
    fragmentShader
});

const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(mesh);

// --- SINCRONIZACIÓN MENÚ-CRISTAL ---
function syncMenuCoordinates() {
    const rect = glassMenu.getBoundingClientRect();
    const webglY = window.innerHeight - rect.top - (rect.height / 2);
    material.uniforms.uMenuPos.value.set(rect.left + rect.width / 2, webglY);
    material.uniforms.uMenuSize.value.set(rect.width, rect.height);
    material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    syncMenuCoordinates();
});
setTimeout(syncMenuCoordinates, 100);

// --- LÓGICA DEL CARRUSEL ---
let currentIndex = 0;
let isAnimating = false;
let autoPlay = true;
let autoPlayTimer;
const dots = document.querySelectorAll('.dot');

function changeImage(nextIndex, direction = 1) {
    if (isAnimating || nextIndex === currentIndex) return;
    isAnimating = true;

    if (nextIndex >= textures.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = textures.length - 1;

    material.uniforms.tCurrent.value = textures[currentIndex];
    material.uniforms.tNext.value = textures[nextIndex];
    material.uniforms.uDirection.value = direction;
    material.uniforms.uProgress.value = 0;
    
    // Aceleré un poquito la animación (de 1.2 a 1.0) para que el slide se sienta más dinámico
    gsap.to(material.uniforms.uProgress, {
        value: 1, 
        duration: 1.0, 
        ease: "power2.inOut",
        onComplete: () => {
            currentIndex = nextIndex;
            isAnimating = false;
            dots.forEach((dot, index) => dot.classList.toggle('active', index === currentIndex));
            material.uniforms.tCurrent.value = textures[currentIndex];
            material.uniforms.uProgress.value = 0;
        }
    });
}

// Botones interactivos
document.getElementById('nextBtn').addEventListener('mousedown', () => { changeImage(currentIndex + 1, 1); resetAutoPlay(); });
document.getElementById('prevBtn').addEventListener('mousedown', () => { changeImage(currentIndex - 1, -1); resetAutoPlay(); });

const autoBtn = document.getElementById('autoBtn');
autoBtn.addEventListener('mousedown', () => {
    autoPlay = !autoPlay;
    if (autoPlay) {
        autoBtn.classList.add('active'); autoBtn.innerText = "Auto: ON"; startAutoPlay();
    } else {
        autoBtn.classList.remove('active'); autoBtn.innerText = "Auto: OFF"; clearInterval(autoPlayTimer);
    }
});

function startAutoPlay() {
    clearInterval(autoPlayTimer);
    autoPlayTimer = setInterval(() => { if(!isAnimating) changeImage(currentIndex + 1, 1); }, 4000);
}
function resetAutoPlay() { if (autoPlay) startAutoPlay(); }

// --- MOTOR DE RENDERIZADO ---
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
startAutoPlay();