var CONFIG = {
    CX: 4000,
    CY: 4000,
    STRAIGHT_LEN: 3600, 
    RADIUS: 950,        
    HALF_STRAIGHT: 1800
};

var keys = keys || {}; 
var spotterText = "CLEAR";
var spotterColor = "#aaa";
var spawnIndex = 0;
var lastTime = performance.now(); 

const brickCanvas = document.createElement('canvas');
brickCanvas.width = 80;  
brickCanvas.height = 40; 
const bctx = brickCanvas.getContext('2d');
bctx.fillStyle = "#000";
bctx.fillRect(0, 0, 80, 40);
bctx.fillStyle = "#5d4037"; 
bctx.fillRect(2, 2, 76, 16);
bctx.fillRect(-38, 22, 76, 16);
bctx.fillRect(42, 22, 76, 16);

let trackPattern = null;

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

if (PROFILES.length === 12) PROFILES.push(...extraAI);

class Car {
    constructor(p, isPlayer) {
        this.name = p.n; 
        this.isPlayer = isPlayer; 
        this.c1 = p.c1; 
        this.c2 = p.c2;
        
        let row = Math.floor(spawnIndex / 2);
        let side = spawnIndex % 2;
        spawnIndex++;

        this.x = CONFIG.CX + 200 + (row * 160);
        this.y = (CONFIG.CY - CONFIG.RADIUS) + (side * 65 - 32);
        
        this.angle = Math.PI;
        this.speed = 0; 
        this.draftBoost = 0;
        this.dirtyAir = 0;
        
        this.accel = isPlayer ? 0.065 : 0.052; 
        this.friction = 0.9992;
        this.maxSpeed = isPlayer ? 11.0 : 10.8; 
        
        this.laps = 0;
        this.passedMid = false;
        this.exactRankValue = 0;
        
        // AI FIX: Aim strictly for the outer half of the track (80 to 140 units offset)
        this.targetOffset = (Math.random() * 60) + 80; 
        this.currentOffset = this.targetOffset;
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
        
        this.applyAeroPhysics(all);
        let input = { up: false, down: false, left: false, right: false };

        if (this.isPlayer) {
            if (keys['KeyW'] || keys['ArrowUp']) input.up = true;
            if (keys['KeyS'] || keys['ArrowDown']) input.down = true;
            if (keys['KeyA'] || keys['ArrowLeft']) input.left = true;
            if (keys['KeyD'] || keys['ArrowRight']) input.right = true;
            this.runSpotter(all);
        } else { 
            this.simulateAI(input, dt, all); 
        }

        let currentMax = this.maxSpeed + this.draftBoost;
        if (input.up) this.speed += this.accel * dt;
        if (input.down) this.speed -= (this.accel * 4) * dt;

        // PHYSICS FIX: Lowered steerBase for both to prevent "snapping" into walls
        let steerBase = this.isPlayer ? 0.016 : 0.028;
        let steerPower = (steerBase * (1.0 - this.dirtyAir * 0.3)) * (1.2 - (this.speed / 20));
        
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
            this.speed *= 0.75; 
            this.createSparks();
            let ang = Math.atan2(this.y - CONFIG.CY, this.x - CONFIG.CX);
            let push = hitO ? -30 : 30; 
            this.x += Math.cos(ang) * push;
            this.y += Math.sin(ang) * push;
            this.angle += (hitO ? -0.18 : 0.18);
        }

        if (this.y > CONFIG.CY + 600) this.passedMid = true;
        if (this.passedMid && this.y < CONFIG.CY - 600 && Math.abs(this.x - CONFIG.CX) < 200) { 
            this.laps++; this.passedMid = false; 
        }
        this.updateSparks(dt);
    }

    applyAeroPhysics(all) {
        this.draftBoost = 0;
        this.dirtyAir = 0;
        for (let other of all) {
            if (other === this) continue;
            let dist = Math.hypot(other.x - this.x, other.y - this.y);
            if (dist < 600 && dist > 40) { 
                let relAng = Math.atan2(other.y - this.y, other.x - this.x);
                let diff = Math.abs(relAng - this.angle);
                while (diff > Math.PI) diff -= Math.PI * 2;
                if (Math.abs(diff) < 0.25) {
                    this.draftBoost = (600 - dist) / 300;
                    this.dirtyAir = (450 - dist) / 450;
                }
            }
        }
    }

    runSpotter(all) {
        let inSide = false, outSide = false;
        all.forEach(other => {
            if (other === this) return;
            if (Math.hypot(other.x - this.x, other.y - this.y) < 120) {
                let rel = Math.atan2(other.y - this.y, other.x - this.x) - this.angle;
                while (rel < -Math.PI) rel += Math.PI * 2;
                while (rel > Math.PI) rel -= Math.PI * 2;
                if (rel < -0.3) inSide = true; 
                if (rel > 0.3) outSide = true;
            }
        });
        if (inSide && outSide) { spotterText = "3 WIDE!"; spotterColor = "#f00"; }
        else if (inSide) { spotterText = "CAR LOW"; spotterColor = "#ff0"; }
        else if (outSide) { spotterText = "CAR HIGH"; spotterColor = "#ff0"; }
        else if (this.draftBoost > 0.5) { spotterText = "TOWING"; spotterColor = "#0f0"; }
        else { spotterText = "CLEAR"; spotterColor = "#aaa"; }
    }

    simulateAI(input, dt, all) {
        input.up = true; 

        // AI FIX: Minimum passing offset is now 50, preventing inside wall contact during overtakes
        if (this.draftBoost > 0.4 && this.laneTimer <= 0) {
            this.targetOffset = (this.targetOffset > 90) ? 55 : 135; 
            this.laneTimer = 300;
        }
        this.laneTimer -= dt;
        this.currentOffset += (this.targetOffset - this.currentOffset) * 0.05;

        const tr = CONFIG.RADIUS + this.currentOffset;
        const lookAhead = 650 + (this.speed * 50); 
        let tx, ty, pivotX = 0;

        // Inside Corner Hard-Avoidance
        let currentDist = 0;
        if (this.x > CONFIG.CX + CONFIG.HALF_STRAIGHT) pivotX = CONFIG.CX + CONFIG.HALF_STRAIGHT;
        else if (this.x < CONFIG.CX - CONFIG.HALF_STRAIGHT) pivotX = CONFIG.CX - CONFIG.HALF_STRAIGHT;
        
        if (pivotX !== 0) {
            currentDist = Math.hypot(this.x - pivotX, this.y - CONFIG.CY);
            if (currentDist < CONFIG.RADIUS - 80) { // EMERGENCY: Too close to inside
                input.right = true; input.left = false; return; 
            }
        }

        // Logic to calculate target points
        if (this.x > CONFIG.CX + CONFIG.HALF_STRAIGHT) {
            let pivot = CONFIG.CX + CONFIG.HALF_STRAIGHT;
            let currentA = Math.atan2(this.y - CONFIG.CY, this.x - pivot);
            let targetA = currentA - (lookAhead / tr);
            tx = pivot + Math.cos(targetA) * tr;
            ty = CONFIG.CY + Math.sin(targetA) * tr;
        } else if (this.x < CONFIG.CX - CONFIG.HALF_STRAIGHT) {
            let pivot = CONFIG.CX - CONFIG.HALF_STRAIGHT;
            let currentA = Math.atan2(this.y - CONFIG.CY, this.x - pivot);
            let targetA = currentA - (lookAhead / tr);
            tx = pivot + Math.cos(targetA) * tr;
            ty = CONFIG.CY + Math.sin(targetA) * tr;
        } else {
            tx = (this.y > CONFIG.CY) ? this.x + lookAhead : this.x - lookAhead;
            ty = (this.y > CONFIG.CY) ? CONFIG.CY + tr : CONFIG.CY - tr;
        }

        let da = Math.atan2(ty - this.y, tx - this.x) - this.angle;
        while (da < -Math.PI) da += Math.PI * 2;
        while (da > Math.PI) da -= Math.PI * 2;

        if (da < -0.01) input.left = true;
        if (da > 0.01) input.right = true;
    }

    checkCollisions(all) {
        for (let other of all) {
            if (other === this) continue;
            let d = Math.hypot(other.x - this.x, other.y - this.y);
            if (d < 35) {
                this.speed *= 0.96; 
                let ang = Math.atan2(this.y - other.y, this.x - other.x);
                this.x += Math.cos(ang) * 4;
                this.y += Math.sin(ang) * 4;
                return true; 
            }
        }
        return false;
    }

    createSparks() { for(let i=0; i<5; i++) this.sparks.push({ x:this.x, y:this.y, vx:(Math.random()-0.5)*15, vy:(Math.random()-0.5)*15, life:1 }); }
    updateSparks(dt) { for(let i=this.sparks.length-1; i>=0; i--) { let s = this.sparks[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.life-=0.04*dt; if(s.life<=0) this.sparks.splice(i,1); } }
    
    draw(ctx) {
        this.sparks.forEach(s => { ctx.fillStyle=`rgba(255,200,50,${s.life})`; ctx.fillRect(s.x, s.y, 4, 4); });
        ctx.save(); 
        ctx.translate(this.x, this.y); 
        ctx.rotate(this.angle);
        
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(8, -2); ctx.lineTo(10, -9); 
        ctx.moveTo(8, 2);  ctx.lineTo(10, 9);  
        ctx.moveTo(-10, -3); ctx.lineTo(-10, -9); 
        ctx.moveTo(-10, 3);  ctx.lineTo(-10, 9);  
        ctx.stroke();

        ctx.fillStyle = "#050505";
        ctx.fillRect(7, -11, 6, 4);   
        ctx.fillRect(7, 7, 6, 4);     
        ctx.fillRect(-14, -11, 7, 4); 
        ctx.fillRect(-14, 7, 7, 4);   

        ctx.fillStyle = this.c1;
        ctx.beginPath();
        ctx.moveTo(15, -1);   
        ctx.lineTo(15, 1);
        ctx.lineTo(5, 2.5);   
        ctx.lineTo(3, 6);      
        ctx.lineTo(-9, 6);    
        ctx.lineTo(-12, 3);   
        ctx.lineTo(-12, -3);
        ctx.lineTo(-9, -6);
        ctx.lineTo(3, -6);
        ctx.lineTo(5, -2.5);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = this.c2;
        ctx.fillRect(13, -8, 2, 16);
        ctx.fillRect(12, -9, 4, 1.5);
        ctx.fillRect(12, 7.5, 4, 1.5);
        ctx.fillRect(-15, -7, 3, 14);
        ctx.fillRect(-16, -8, 4, 1.5);
        ctx.fillRect(-16, 6.5, 4, 1.5);
        ctx.beginPath();
        ctx.moveTo(1, 0);     
        ctx.lineTo(-3, -4.5);
        ctx.lineTo(-10, -4.5);
        ctx.lineTo(-13, -2);
        ctx.lineTo(-13, 2);
        ctx.lineTo(-10, 4.5);
        ctx.lineTo(-3, 4.5);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#000";
        ctx.fillRect(-3, -2, 6, 4);
        ctx.fillStyle = "#000";
        ctx.fillRect(-2, -1, 3, 2);

        ctx.restore();
    }
}

function createIndyPath(w, r) {
    const p = new Path2D();
    p.moveTo(CONFIG.CX + w/2, CONFIG.CY - r);
    p.lineTo(CONFIG.CX - w/2, CONFIG.CY - r);
    p.arc(CONFIG.CX - w/2, CONFIG.CY, r, -Math.PI/2, Math.PI/2, true);
    p.lineTo(CONFIG.CX + w/2, CONFIG.CY + r);
    p.arc(CONFIG.CX + w/2, CONFIG.CY, r, Math.PI/2, -Math.PI/2, true);
    p.closePath();
    return p;
}

const outerWall = createIndyPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS + 180);
const innerWall = createIndyPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS - 180);
const whiteLineOuter = createIndyPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS + 150);
const whiteLineInner = createIndyPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS - 150);

function loop(time, ctx, canvas) {
    let dt = (time - lastTime) / 8; 
    if (isNaN(dt) || dt > 5) dt = 1; 
    lastTime = time;
    if(raceOver) return;

    if (!trackPattern) trackPattern = ctx.createPattern(brickCanvas, 'repeat');
    if (!cars || cars.length === 0) return requestAnimationFrame((t) => loop(t, ctx, canvas));

    const player = cars.find(c => c.isPlayer);
    let camX = player ? player.x - canvas.width/2 : 4000;
    let camY = player ? player.y - canvas.height/2 : 4000;

    ctx.save();
    ctx.fillStyle = "#111"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(-camX, -camY);

    ctx.fillStyle = "#1a3317"; ctx.fill(innerWall);
    ctx.strokeStyle = trackPattern; 
    ctx.lineWidth = 360; 
    ctx.stroke(createIndyPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS));
    
    ctx.setLineDash([80, 50]); 
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 6;
    ctx.stroke(whiteLineOuter);
    ctx.stroke(whiteLineInner);
    ctx.setLineDash([]); 

    ctx.strokeStyle = "#fff"; ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(CONFIG.CX, CONFIG.CY - CONFIG.RADIUS + 180);
    ctx.lineTo(CONFIG.CX, CONFIG.CY - CONFIG.RADIUS - 180);
    ctx.stroke();

    ctx.strokeStyle = "#eee"; ctx.lineWidth = 12; 
    ctx.stroke(outerWall);
    ctx.strokeStyle = "#ff0"; ctx.lineWidth = 6;
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
        document.getElementById('speed-display').innerText = Math.round(player.speed * 21.8); 
        document.getElementById('spotter').innerText = spotterText;
        document.getElementById('spotter').style.color = spotterColor;
        document.getElementById('board-content').innerHTML = sorted.slice(0, 15).map((c, i) => 
            `<div style="color:${c.isPlayer?'#ff0':'#fff'}">${i+1}. ${c.name}</div>`).join('');
    }
    requestAnimationFrame((t) => loop(t, ctx, canvas));
}