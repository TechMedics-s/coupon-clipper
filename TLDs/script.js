document.addEventListener("DOMContentLoaded", () => {

    const capLayer = document.getElementById("capLayer");
    const heroSection = document.getElementById("home");

    const SETTINGS = {
        CAP_COUNT: 14,
        GRAVITY: 1500,
        AIR_DRAG: 0.12,
        ANGULAR_DRAG: 0.02,
        BOUNCE_RESTITUTION: 0.25,
        GROUND_OFFSET: 50,
        APEX_MIN: 0.35,
        APEX_MAX: 0.55,
        SHADOW_MAX_BLUR: 14,
        PERSPECTIVE: 1200,
        HOVER_TRIGGER_DISTANCE: 120,
        HOVER_TRIGGER_PROBABILITY: 0.18
    };

    capLayer.style.perspective = SETTINGS.PERSPECTIVE + "px";

    const caps = [];
    
    const getViewport = () => ({
        width: window.innerWidth,
        height: window.innerHeight
    });

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    function getGroundY() {
        return window.innerHeight - SETTINGS.GROUND_OFFSET;
    }

    for (let i = 0; i < SETTINGS.CAP_COUNT; i++) {
        const cap = document.createElement("div");
        cap.className = "grad-cap";
        cap.innerHTML = `<span class="cap-inner">🎓</span>`;

        const shadow = document.createElement("div");
        shadow.className = "cap-shadow";

        capLayer.appendChild(cap);
        capLayer.appendChild(shadow);

        const vp = getViewport();
        const xPct = randomBetween(5, 95);
        const baseX = vp.width * (xPct / 100);
        const groundY = getGroundY();

        const state = {
            el: cap,
            shadowEl: shadow,
            x: baseX,
            y: groundY - 40,
            vx: 0,
            vy: 0,
            ang: Math.random() * 360,
            angVel: 0,
            w: 40,
            h: 40,
            resting: true,
            canToss: true,
            lastTossTime: 0
        };

        const sRect = cap.getBoundingClientRect();
        state.w = sRect.width || 40;
        state.h = sRect.height || 40;

        caps.push(state);
        updateShadow(state);
        updateTransform(state);
    }

    function updateTransform(s) {
        const vp = getViewport();
        const groundY = getGroundY();
        
        const heightAboveGround = Math.max(0, groundY - s.h - s.y);
        const t = Math.max(0, Math.min(1, heightAboveGround / vp.height));

        const scale = 1 - 0.16 * t;
        const rotX = Math.sin(s.ang * Math.PI / 180) * 38;
        const rotY = Math.cos(s.ang * Math.PI / 280) * 38;
        const z = Math.round(150 * t);

        s.el.style.transform =
            `translate3d(${s.x}px, ${s.y}px, ${z}px)
             rotateX(${rotX}deg)
             rotateY(${rotY}deg)
             rotateZ(${s.ang}deg)
             scale(${scale})`;

        s.el.style.opacity = 1 - t * 0.45;
    }

    function updateShadow(s) {
        const vp = getViewport();
        const groundY = getGroundY();
        
        const heightAboveGround = Math.max(0, groundY - (s.y + s.h));
        const t = Math.max(0, Math.min(1, heightAboveGround / vp.height));

        const scale = 1 - 0.65 * t;
        const blur = 3 + SETTINGS.SHADOW_MAX_BLUR * t;

        s.shadowEl.style.left = (s.x + s.w / 2 - (40 * scale) / 2) + "px";
        s.shadowEl.style.top = (groundY - 6) + "px";
        s.shadowEl.style.transform = `scaleX(${scale}) scaleY(${0.6 * scale})`;
        s.shadowEl.style.opacity = 0.9 - t;
        s.shadowEl.style.filter = `blur(${blur}px)`;
    }

    function toss(s, dir = 0) {
        if (!s.resting || !s.canToss) return;

        const now = performance.now();
        if (now - s.lastTossTime < 300) return;

        const vp = getViewport();
        const targetApex = vp.height * randomBetween(SETTINGS.APEX_MIN, SETTINGS.APEX_MAX);
        s.vy = -Math.sqrt(2 * SETTINGS.GRAVITY * targetApex) * randomBetween(0.9, 1.15);

        const hor = randomBetween(160, 380);
        const side = dir || (Math.random() < 0.5 ? -1 : 1);
        s.vx = side * hor * randomBetween(0.5, 1.1);

        s.angVel = (Math.random() * 1000 - 500) * randomBetween(0.6, 1.2);

        s.resting = false;
        s.canToss = false;
        s.lastTossTime = now;
    }

    document.addEventListener("mousemove", (e) => {
        for (const s of caps) {
            if (!s.resting) continue;

            const dx = e.clientX - (s.x + s.w / 2);
            const dy = e.clientY - (s.y + s.h / 2);
            const d = Math.sqrt(dx*dx + dy*dy);

            if (d < SETTINGS.HOVER_TRIGGER_DISTANCE && Math.random() < SETTINGS.HOVER_TRIGGER_PROBABILITY) {
                const dir = dx < 0 ? -1 : 1;
                toss(s, dir);
            }
        }
    });

    let last = performance.now();
    function animate(now) {
        const dt = Math.min(0.03, (now - last) / 1000);
        last = now;

        const vp = getViewport();
        const leftBound = -100;
        const rightBound = vp.width + 100;
        const groundY = getGroundY();

        for (const s of caps) {
            if (s.resting) {
                s.y = groundY - s.h;
                updateTransform(s);
                updateShadow(s);
                continue;
            }

            s.vx *= 1 - SETTINGS.AIR_DRAG * dt;
            s.vy += SETTINGS.GRAVITY * dt;
            s.angVel *= 1 - SETTINGS.ANGULAR_DRAG * dt;

            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.ang += s.angVel * dt;

            if (s.x < leftBound) { s.x = leftBound; s.vx *= -0.4; }
            if (s.x > rightBound - s.w) { s.x = rightBound - s.w; s.vx *= -0.4; }

            const ground = groundY - s.h;
            if (s.y >= ground) {
                if (Math.abs(s.vy) > 180) {
                    s.y = ground;
                    s.vy = -s.vy * SETTINGS.BOUNCE_RESTITUTION;
                    s.vx *= 0.75;
                    s.angVel *= 0.55;
                } else {
                    s.y = ground;
                    s.vx = 0;
                    s.vy = 0;
                    s.angVel = 0;
                    s.resting = true;
                    s.canToss = true;
                }
            }

            updateTransform(s);
            updateShadow(s);
        }

        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    function createParticles() {
        const particlesContainer = document.getElementById('particles');
        const particleCount = 40;
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 20 + 's';
            particle.style.animationDuration = (20 + Math.random() * 10) + 's';
            particlesContainer.appendChild(particle);
        }
    }

    window.addEventListener('scroll', function() {
        const navbar = document.getElementById('navbar');
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', function() {
            const faqItem = this.parentElement;
            const allItems = document.querySelectorAll('.faq-item');
            allItems.forEach(item => {
                if (item !== faqItem) {
                    item.classList.remove('active');
                }
            });
            faqItem.classList.toggle('active');
        });
    });

    window.addEventListener('load', function() {
        setTimeout(() => {
            document.getElementById('loader').classList.add('hidden');
        }, 800);
    });

    function copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            return new Promise((resolve, reject) => {
                document.execCommand('copy') ? resolve() : reject();
                textArea.remove();
            });
        }
    }

    function showCopyFeedback(addressEl, cryptoName, originalText) {
        addressEl.textContent = `✓ ${cryptoName} address copied!`;
        addressEl.style.color = '#00d4ff';
        setTimeout(() => {
            addressEl.textContent = originalText;
            addressEl.style.color = '';
        }, 2000);
    }

    document.querySelectorAll('.qr-item').forEach(qrItem => {
        qrItem.style.cursor = 'pointer';
        qrItem.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const card = this.closest('.payment-card');
            const addressEl = card.querySelector('.crypto-address');
            const cryptoName = card.dataset.crypto || 'Address';
            const text = this.dataset.address || addressEl.textContent.trim();
            const originalText = addressEl.textContent;
            
            if (originalText.includes('copied')) return;
            
            copyToClipboard(text).then(() => {
                showCopyFeedback(addressEl, cryptoName, originalText);
            }).catch(() => {
                alert('Copy failed. Address: ' + text);
            });
        });
    });

    document.querySelectorAll('.crypto-address').forEach(addressEl => {
        addressEl.style.cursor = 'pointer';
        addressEl.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const card = this.closest('.payment-card');
            const cryptoName = card.dataset.crypto || 'Address';
            const text = this.textContent.trim();
            
            if (text.includes('copied')) return;
            
            copyToClipboard(text).then(() => {
                showCopyFeedback(this, cryptoName, text);
            }).catch(() => {
                alert('Copy failed. Address: ' + text);
            });
        });
    });

    createParticles();

    const customCursor = document.getElementById('customCursor');
    const cursorGlow = document.getElementById('cursorGlow');
    let cursorX = 0, cursorY = 0;
    let glowX = 0, glowY = 0;

    document.addEventListener('mousemove', (e) => {
        cursorX = e.clientX;
        cursorY = e.clientY;
        customCursor.style.left = cursorX + 'px';
        customCursor.style.top = cursorY + 'px';
    });

    function animateGlow() {
        glowX += (cursorX - glowX) * 0.1;
        glowY += (cursorY - glowY) * 0.1;
        cursorGlow.style.left = glowX + 'px';
        cursorGlow.style.top = glowY + 'px';
        requestAnimationFrame(animateGlow);
    }
    animateGlow();

    const interactiveElements = document.querySelectorAll('a, button, .btn-primary, .btn-secondary, .pricing-card, .feature-card, .payment-card, .faq-question, .qr-item, .crypto-address');
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => customCursor.classList.add('hover'));
        el.addEventListener('mouseleave', () => customCursor.classList.remove('hover'));
    });

    const tiltCards = document.querySelectorAll('.feature-card');
    tiltCards.forEach(card => {
        card.classList.add('tilt-card');
        
        const glare = document.createElement('div');
        glare.className = 'card-glare';
        card.appendChild(glare);

        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 30;
            const rotateY = (centerX - x) / 30;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;
            
            const glareX = (x / rect.width) * 100;
            const glareY = (y / rect.height) * 100;
            glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.12) 0%, transparent 50%)`;
            glare.style.opacity = '1';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
            glare.style.opacity = '0';
        });
    });

    const magneticBtns = document.querySelectorAll('.btn-primary, .btn-secondary');
    magneticBtns.forEach(btn => {
        btn.classList.add('magnetic-btn');
        
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            btn.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0, 0)';
        });
    });

    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIndex = 0;

    document.addEventListener('keydown', (e) => {
        if (e.key === konamiCode[konamiIndex]) {
            konamiIndex++;
            if (konamiIndex === konamiCode.length) {
                activateEasterEgg();
                konamiIndex = 0;
            }
        } else {
            konamiIndex = 0;
        }
    });

    function activateEasterEgg() {
        caps.forEach((s, i) => {
            setTimeout(() => {
                if (s.resting) {
                    s.vy = -Math.sqrt(2 * 1500 * (window.innerHeight * 0.6));
                    s.vx = (Math.random() - 0.5) * 600;
                    s.angVel = (Math.random() - 0.5) * 1500;
                    s.resting = false;
                    s.canToss = false;
                }
            }, i * 40);
        });

        const celebration = document.createElement('div');
        celebration.innerHTML = '🎓 GRADUATION MODE! 🎓';
        celebration.style.cssText = `
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            font-size: 28px; font-weight: 900; color: white;
            text-shadow: 0 0 20px #00d4ff, 0 0 40px #7c3aed;
            z-index: 10001; pointer-events: none;
            animation: pulse 0.5s ease infinite;
        `;
        document.body.appendChild(celebration);
        setTimeout(() => celebration.remove(), 3000);
    }

    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
        const velocity = Math.abs(window.scrollY - lastScrollY);
        lastScrollY = window.scrollY;
        const blur = Math.min(velocity * 0.03, 2);
        document.querySelectorAll('.feature-card, .pricing-card').forEach(el => {
            el.style.filter = `blur(${blur}px)`;
        });
        clearTimeout(window.scrollBlurTimeout);
        window.scrollBlurTimeout = setTimeout(() => {
            document.querySelectorAll('.feature-card, .pricing-card').forEach(el => {
                el.style.filter = 'blur(0px)';
            });
        }, 50);
    });

});
