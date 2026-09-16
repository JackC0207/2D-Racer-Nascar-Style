var CONFIG = {
    CX: 4000,
    CY: 4000,
    STRAIGHT_LEN: 3200, 
    RADIUS: 850,        
    HALF_STRAIGHT: 1600,
    TRI_KINK: 300       
};

// Ensure keys and timing are synced with global state
var keys = keys || {}; 
var spotterText = "CLEAR";
var spotterColor = "#aaa";
var spawnIndex = 0;
var lastTime = performance.now(); 

// 12 Additional Goofy PG AI Racers
const extraAI = [
    { n: "Nacho Fast", c1: "#f39c12", c2: "#e74c3c" },
    { n: "Speedy McSpeedy", c1: "#9b59b6", c2: "#2980b9" },
    { n: "Lawnmower Man", c1: "#27ae60", c2: "#f1c40f" },
    { n: "Gary the Snail", c1: "#ecf0f1", c2: "#95a5a6" },
    { n: "Rocket Sauce", c1: "#e67e22", c2: "#d35400" },
    { n: "Bumper Thumper", c1: "#7f8c8d", c2: "#2c3e50" },
    { n: "Drafting Dave", c1: "#3498db", c2: "#2980b9" },
    { n: "Tire Eater", c1: "#1abc9c", c2: "#16a085" },
    { n: "Sparky", c1: "#f1c40f", c2: "#ffffff" },
    { n: "Understeer Stan", c1: "#e74c3c", c2: "#c0392b" },
    { n: "Sideways Sam", c1: "#8e44ad", c2: "#2c3e50" },
    { n: "The Tortoise", c1: "#2ecc71", c2: "#27ae60" }
];

// Inject extra racers into the profile list if not already added
if (PROFILES.length === 12) {
    PROFILES.push(...extraAI);
}

class Car {
    constructor(p, isPlayer) {
        this.name = p.n; 
        this.isPlayer = isPlayer; 
        this.c1 = p.c1; 
        this.c2 = p.c2;
        
        let row = Math.floor(spawnIndex / 2);
        let side = spawnIndex % 2;
        spawnIndex++;

        this.x = CONFIG.CX - CONFIG.HALF_STRAIGHT + (row * 160);
        this.y = (CONFIG.CY + CONFIG.RADIUS) + (side * 65 - 32);
        
        this.angle = 0; 
        this.speed = 0; 
        this.draftBoost = 0;
        
        // AI TUNING: Harder difficulty for Talladega
        this.accel = isPlayer ? 0.026 : 0.032; 
        this.friction = 0.998;
        this.maxSpeed = isPlayer ? 5.5 : 5.75; // AI is faster here
        
        this.laps = 0;
        this.passedMid = false;
        this.exactRankValue = 0;
        
        this.offset = (Math.random() * 90); 
        this.laneTimer = 0;
        this.sparks = [];
    }

    getLapProgress() {
        const dx = this.x - CONFIG.CX, dy = this.y - CONFIG.CY;
        let angle = Math.atan2(dy, dx); 
        let progress = (Math.PI * 2 - (angle + Math.PI / 2)) % (Math.PI * 2);
        return progress / (Math.PI * 2);
    }

    update(all, dt, raceStarted, ctx, outer, inner, currentPos) {
        this.exactRankValue = this.laps + this.getLapProgress();
        if (!raceStarted) return;
        
        this.applyDraft(all);
        let input = { up: false, down: false, left: false, right: false };
        let catchUp = (currentPos >= 10) ? 0.5 : 0;

        if (this.isPlayer) {
            if (keys['KeyW'] || keys['ArrowUp']) input.up = true;
            if (keys['KeyS'] || keys['ArrowDown']) input.down = true;
            if (keys['KeyA'] || keys['ArrowLeft']) input.left = true;
            if (keys['KeyD'] || keys['ArrowRight']) input.right = true;
            this.runSpotter(all);
        } else { 
            this.simulateAI(input, dt); 
        }

        let currentMax = this.maxSpeed + catchUp + this.draftBoost;

        if (input.up) this.speed += this.accel * dt;
        if (input.down) this.speed -= (this.accel * 4) * dt;

        let steerPower = (this.isPlayer ? 0.021 : 0.038) * (1.1 - (this.speed / 10));
        if (input.left) this.angle -= steerPower * dt;
        if (input.right) this.angle += steerPower * dt;

        this.speed *= Math.pow(this.friction, dt);
        this.speed = Math.max(-1, Math.min(this.speed, currentMax));
        
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;

        ctx.save(); ctx.resetTransform();
        let hitO = !ctx.isPointInPath(outer, this.x, this.y);
        let hitI = ctx.isPointInPath(inner, this.x, this.y);
        ctx.restore();

        if (hitO || hitI) {
            this.speed *= 0.60; 
            this.createSparks();
            let ang = Math.atan2(this.y - CONFIG.CY, this.x - CONFIG.CX);
            let push = hitO ? -30 : 30;
            this.x += Math.cos(ang) * push;
            this.y += Math.sin(ang) * push;
            this.angle += (hitO ? -0.15 : 0.15);
        }

        if (this.y > CONFIG.CY + 600) this.passedMid = true;
        if (this.passedMid && this.y < CONFIG.CY - 600 && Math.abs(this.x - CONFIG.CX) < 150) { 
            this.laps++; this.passedMid = false; 
        }
        this.updateSparks(dt);
    }

    applyDraft(all) {
        this.draftBoost = 0;
        for (let other of all) {
            if (other === this) continue;
            let dist = Math.hypot(other.x - this.x, other.y - this.y);
            if (dist < 400 && dist > 32) { 
                let relAng = Math.atan2(other.y - this.y, other.x - this.x);
                let diff = Math.abs(relAng - this.angle);
                while (diff > Math.PI) diff -= Math.PI * 2;
                if (Math.abs(diff) < 0.28) this.draftBoost = (400 - dist) / 550; 
            }
        }
    }

    runSpotter(all) {
        let inSide = false, outSide = false;
        all.forEach(other => {
            if (other === this) return;
            if (Math.hypot(other.x - this.x, other.y - this.y) < 100) {
                let rel = Math.atan2(other.y - this.y, other.x - this.x) - this.angle;
                while (rel < -Math.PI) rel += Math.PI * 2;
                while (rel > Math.PI) rel -= Math.PI * 2;
                if (rel < -0.4) inSide = true; 
                if (rel > 0.4) outSide = true;
            }
        });
        if (inSide && outSide) { spotterText = "3 WIDE!"; spotterColor = "#f00"; }
        else if (inSide) { spotterText = "CAR LOW"; spotterColor = "#ff0"; }
        else if (outSide) { spotterText = "CAR HIGH"; spotterColor = "#ff0"; }
        else if (this.draftBoost > 0.1) { spotterText = "DRAFTING"; spotterColor = "#0f0"; }
        else { spotterText = "CLEAR"; spotterColor = "#aaa"; }
    }

    simulateAI(input, dt) {
        input.up = true; 
        this.laneTimer += dt;
        if (this.laneTimer > 300) {
            this.offset = (Math.random() * 90); 
            this.laneTimer = 0;
        }
        const tr = CONFIG.RADIUS + this.offset;
        const lookAhead = 300 + (this.speed * 25); 
        let tx, ty;
        if (this.x > CONFIG.CX + CONFIG.HALF_STRAIGHT) {
            let pivotX = CONFIG.CX + CONFIG.HALF_STRAIGHT;
            let currentA = Math.atan2(this.y - CONFIG.CY, this.x - pivotX);
            let targetA = currentA - (lookAhead / tr);
            tx = pivotX + Math.cos(targetA) * tr;
            ty = CONFIG.CY + Math.sin(targetA) * tr;
        } else if (this.x < CONFIG.CX - CONFIG.HALF_STRAIGHT) {
            let pivotX = CONFIG.CX - CONFIG.HALF_STRAIGHT;
            let currentA = Math.atan2(this.y - CONFIG.CY, this.x - pivotX);
            let targetA = currentA - (lookAhead / tr);
            tx = pivotX + Math.cos(targetA) * tr;
            ty = CONFIG.CY + Math.sin(targetA) * tr;
        } else {
            if (this.y > CONFIG.CY) { 
                tx = this.x + lookAhead;
                ty = CONFIG.CY + tr;
            } else { 
                tx = this.x - lookAhead;
                let kinkF = 1 - (Math.abs(tx - CONFIG.CX) / CONFIG.HALF_STRAIGHT);
                ty = (CONFIG.CY - tr) - (CONFIG.TRI_KINK * Math.max(0, kinkF));
            }
        }
        let da = Math.atan2(ty - this.y, tx - this.x) - this.angle;
        while (da < -Math.PI) da += Math.PI * 2;
        while (da > Math.PI) da -= Math.PI * 2;
        let distFromCenter = Math.hypot(this.x - CONFIG.CX, this.y - CONFIG.CY);
        if (distFromCenter < CONFIG.RADIUS - 50) da += 0.4; 
        if (da < -0.01) input.left = true;
        if (da > 0.01) input.right = true;
    }

    checkCollisions(all) {
        for (let other of all) {
            if (other === this) continue;
            let d = Math.hypot(other.x - this.x, other.y - this.y);
            if (d < 31) {
                this.speed *= 0.98; 
                let ang = Math.atan2(this.y - other.y, this.x - other.x);
                this.x += Math.cos(ang) * 3;
                this.y += Math.sin(ang) * 3;
                return true; 
            }
        }
        return false;
    }

    createSparks() { for(let i=0; i<3; i++) this.sparks.push({ x:this.x, y:this.y, vx:(Math.random()-0.5)*9, vy:(Math.random()-0.5)*9, life:1 }); }
    updateSparks(dt) { for(let i=this.sparks.length-1; i>=0; i--) { let s = this.sparks[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.life-=0.06*dt; if(s.life<=0) this.sparks.splice(i,1); } }
    
    draw(ctx) {
        this.sparks.forEach(s => { ctx.fillStyle=`rgba(255,180,40,${s.life})`; ctx.fillRect(s.x, s.y, 3, 3); });
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        ctx.fillStyle = "#000"; ctx.fillRect(-16, -11, 32, 22);
        ctx.fillStyle = this.c1; ctx.fillRect(-15, -10, 30, 20);
        ctx.fillStyle = this.c2; 
        ctx.fillRect(-14, -10, 28, 2);   
        ctx.fillRect(-14, 8, 28, 2);  
        ctx.fillStyle = "#000"; 
        ctx.fillRect(2, -8, 7, 16);   
        ctx.fillRect(-11, -8, 5, 16);  
        ctx.fillRect(-4, -10, 6, 2);   
        ctx.fillRect(-4, 8, 6, 2);     
        ctx.restore();
    }
}

function createTalladegaPath(w, r, kink) {
    const p = new Path2D();
    p.moveTo(CONFIG.CX, CONFIG.CY - r - kink);
    p.lineTo(CONFIG.CX - w/2, CONFIG.CY - r);
    p.arc(CONFIG.CX - w/2, CONFIG.CY, r, -Math.PI/2, Math.PI/2, true);
    p.lineTo(CONFIG.CX + w/2, CONFIG.CY + r);
    p.arc(CONFIG.CX + w/2, CONFIG.CY, r, Math.PI/2, -Math.PI/2, true);
    p.closePath();
    return p;
}

const outerWall = createTalladegaPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS + 160, CONFIG.TRI_KINK);
const innerWall = createTalladegaPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS - 160, CONFIG.TRI_KINK);
const whiteLineOuter = createTalladegaPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS + 140, CONFIG.TRI_KINK);
const whiteLineInner = createTalladegaPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS - 140, CONFIG.TRI_KINK);

function loop(time, ctx, canvas) {
    let dt = (time - lastTime) / 8; 
    if (isNaN(dt) || dt > 5) dt = 1; 
    lastTime = time;
    if(raceOver) return;
    
    // Safety check for cars array initialization
    if (!cars || cars.length === 0) return requestAnimationFrame((t) => loop(t, ctx, canvas));

    const player = cars.find(c => c.isPlayer);
    let camX = player ? player.x - canvas.width/2 : 4000;
    let camY = player ? player.y - canvas.height/2 : 4000;

    ctx.save();
    ctx.fillStyle = "#111"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(-camX, -camY);

    ctx.fillStyle = "#1a3317"; ctx.fill(innerWall);
    ctx.strokeStyle = "#222"; ctx.lineWidth = 320; 
    ctx.stroke(createTalladegaPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS, CONFIG.TRI_KINK));
    
    ctx.setLineDash([60, 40]); 
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 5;
    ctx.stroke(whiteLineOuter);
    ctx.stroke(whiteLineInner);
    ctx.setLineDash([]); 

    ctx.strokeStyle = "#fff"; ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(CONFIG.CX, CONFIG.CY - CONFIG.RADIUS - CONFIG.TRI_KINK + 160);
    ctx.lineTo(CONFIG.CX, CONFIG.CY - CONFIG.RADIUS - CONFIG.TRI_KINK - 160);
    ctx.stroke();

    ctx.strokeStyle = "#eee"; ctx.lineWidth = 10; 
    ctx.stroke(outerWall);
    ctx.strokeStyle = "#ff0"; ctx.lineWidth = 5;
    ctx.stroke(innerWall);

    const sorted = [...cars].sort((a,b) => b.exactRankValue - a.exactRankValue);
    
    cars.forEach(c => {
        c.update(cars, dt, raceStarted, ctx, outerWall, innerWall, sorted.indexOf(c));
        c.checkCollisions(cars);
        c.draw(ctx);
        if (c.laps > 15) {
            raceOver = true;
            document.getElementById('win-screen').style.display = 'block';
            document.getElementById('winner-name').innerText = `${c.name} WINS!`;
        }
    });
    
    ctx.restore();

    if(raceStarted && !raceOver && player) {
        document.getElementById('lap-display').innerText = `${Math.min(15, player.laps)}/15`;
        document.getElementById('speed-display').innerText = Math.round(player.speed * 42);
        document.getElementById('spotter').innerText = spotterText;
        document.getElementById('spotter').style.color = spotterColor;
        document.getElementById('board-content').innerHTML = sorted.slice(0, 15).map((c, i) => 
            `<div style="color:${c.isPlayer?'#ff0':'#fff'}">${i+1}. ${c.name}</div>`).join('');
    }
    requestAnimationFrame((t) => loop(t, ctx, canvas));
}