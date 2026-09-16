var CONFIG = {
    CX: 3000,
    CY: 3000,
    STRAIGHT_LEN: 2200, 
    RADIUS: 650,        
    HALF_STRAIGHT: 1100,
    TRI_KINK: 180       
};

var keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

var spotterText = "CLEAR";
var spotterColor = "#aaa";
var spawnIndex = 0;
var lastTime = performance.now(); 

class Car {
    constructor(p, isPlayer) {
        this.name = p.n; 
        this.isPlayer = isPlayer; 
        this.c1 = p.c1; 
        this.c2 = p.c2;
        
        let row = Math.floor(spawnIndex / 2);
        let side = spawnIndex % 2;
        spawnIndex++;

        this.x = CONFIG.CX - CONFIG.HALF_STRAIGHT + (row * 150);
        this.y = (CONFIG.CY + CONFIG.RADIUS) + (side * 60 - 30);
        
        this.angle = 0; 
        this.speed = 0; 
        this.draftBoost = 0;
        
        this.accel = isPlayer ? 0.026 : 0.027; 
        this.friction = 0.998;
        this.maxSpeed = isPlayer ? 5.3 : 5.15; 
        
        this.laps = 0;
        this.passedMid = false;
        this.exactRankValue = 0;
        
        this.offset = (Math.random() * 80); 
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
        let catchUp = (currentPos >= 8) ? 0.4 : 0;

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

        let steerPower = (this.isPlayer ? 0.021 : 0.035) * (1.1 - (this.speed / 9));
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
            this.speed *= 0.65; 
            this.createSparks();
            let ang = Math.atan2(this.y - CONFIG.CY, this.x - CONFIG.CX);
            let push = hitO ? -25 : 25;
            this.x += Math.cos(ang) * push;
            this.y += Math.sin(ang) * push;
            this.angle += (hitO ? -0.12 : 0.12);
        }

        if (this.y > CONFIG.CY + 400) this.passedMid = true;
        if (this.passedMid && this.y < CONFIG.CY - 400 && Math.abs(this.x - CONFIG.CX) < 100) { 
            this.laps++; this.passedMid = false; 
        }
        this.updateSparks(dt);
    }

    applyDraft(all) {
        this.draftBoost = 0;
        for (let other of all) {
            if (other === this) continue;
            let dist = Math.hypot(other.x - this.x, other.y - this.y);
            if (dist < 350 && dist > 32) { // Draft ends exactly where collision begins
                let relAng = Math.atan2(other.y - this.y, other.x - this.x);
                let diff = Math.abs(relAng - this.angle);
                while (diff > Math.PI) diff -= Math.PI * 2;
                if (Math.abs(diff) < 0.25) this.draftBoost = (350 - dist) / 600; 
            }
        }
    }

    runSpotter(all) {
        let inSide = false, outSide = false;
        all.forEach(other => {
            if (other === this) return;
            if (Math.hypot(other.x - this.x, other.y - this.y) < 90) {
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
            this.offset = (Math.random() * 80); 
            this.laneTimer = 0;
        }
        const tr = CONFIG.RADIUS + this.offset;
        const lookAhead = 250 + (this.speed * 20); 
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
        if (distFromCenter < CONFIG.RADIUS - 40) da += 0.35; 
        if (da < -0.01) input.left = true;
        if (da > 0.01) input.right = true;
    }

    checkCollisions(all) {
        for (let other of all) {
            if (other === this) continue;
            let d = Math.hypot(other.x - this.x, other.y - this.y);
            // Changed from 35 to 31 to eliminate the air gap
            if (d < 31) {
                this.speed *= 0.99; 
                let ang = Math.atan2(this.y - other.y, this.x - other.x);
                this.x += Math.cos(ang) * 2;
                this.y += Math.sin(ang) * 2;
                return true; 
            }
        }
        return false;
    }

    createSparks() { for(let i=0; i<3; i++) this.sparks.push({ x:this.x, y:this.y, vx:(Math.random()-0.5)*8, vy:(Math.random()-0.5)*8, life:1 }); }
    updateSparks(dt) { for(let i=this.sparks.length-1; i>=0; i--) { let s = this.sparks[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.life-=0.06*dt; if(s.life<=0) this.sparks.splice(i,1); } }
    
    draw(ctx) {
        this.sparks.forEach(s => { ctx.fillStyle=`rgba(255,200,50,${s.life})`; ctx.fillRect(s.x, s.y, 3, 3); });
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        
        // 1. Black Outline/Chassis (Matches the 32px length)
        ctx.fillStyle = "#000"; ctx.fillRect(-16, -11, 32, 22);
        
        // 2. Primary Color Body
        ctx.fillStyle = this.c1; ctx.fillRect(-15, -10, 30, 20);
        
        // 3. Trim Lines
        ctx.fillStyle = this.c2; 
        ctx.fillRect(-14, -10, 28, 2);   
        ctx.fillRect(-14, 8, 28, 2);  
        
        // 4. Windows
        ctx.fillStyle = "#000"; 
        ctx.fillRect(2, -8, 7, 16);   // Windshield
        ctx.fillRect(-11, -8, 5, 16);  // Rear
        ctx.fillRect(-4, -10, 6, 2);   // Left Side
        ctx.fillRect(-4, 8, 6, 2);     // Right Side
        
        ctx.restore();
    }
}

function createDaytonaPath(w, r, kink) {
    const p = new Path2D();
    p.moveTo(CONFIG.CX, CONFIG.CY - r - kink);
    p.lineTo(CONFIG.CX - w/2, CONFIG.CY - r);
    p.arc(CONFIG.CX - w/2, CONFIG.CY, r, -Math.PI/2, Math.PI/2, true);
    p.lineTo(CONFIG.CX + w/2, CONFIG.CY + r);
    p.arc(CONFIG.CX + w/2, CONFIG.CY, r, Math.PI/2, -Math.PI/2, true);
    p.closePath();
    return p;
}

const outerWall = createDaytonaPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS + 130, CONFIG.TRI_KINK);
const innerWall = createDaytonaPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS - 130, CONFIG.TRI_KINK);
const whiteLineOuter = createDaytonaPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS + 115, CONFIG.TRI_KINK);
const whiteLineInner = createDaytonaPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS - 115, CONFIG.TRI_KINK);

function loop(time, ctx, canvas) {
    let dt = (time - lastTime) / 8; 
    if (isNaN(dt) || dt > 5) dt = 1; 
    lastTime = time;
    if(raceOver) return;
    
    const player = cars.find(c => c.isPlayer);
    let camX = player ? player.x - canvas.width/2 : 3000;
    let camY = player ? player.y - canvas.height/2 : 3000;

    ctx.save();
    ctx.fillStyle = "#111"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(-camX, -camY);

    ctx.fillStyle = "#1a3317"; ctx.fill(innerWall);
    ctx.strokeStyle = "#222"; ctx.lineWidth = 265; 
    ctx.stroke(createDaytonaPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS, CONFIG.TRI_KINK));
    
    ctx.setLineDash([50, 30]); 
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 4;
    ctx.stroke(whiteLineOuter);
    ctx.stroke(whiteLineInner);
    ctx.setLineDash([]); 

    ctx.strokeStyle = "#fff"; ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(CONFIG.CX, CONFIG.CY - CONFIG.RADIUS - CONFIG.TRI_KINK + 130);
    ctx.lineTo(CONFIG.CX, CONFIG.CY - CONFIG.RADIUS - CONFIG.TRI_KINK - 130);
    ctx.stroke();

    ctx.strokeStyle = "#ddd"; ctx.lineWidth = 8; 
    ctx.stroke(outerWall);
    ctx.strokeStyle = "#ff0"; ctx.lineWidth = 4;
    ctx.stroke(innerWall);

    const sorted = [...cars].sort((a,b) => b.exactRankValue - a.exactRankValue);
    
    cars.forEach(c => {
        c.update(cars, dt, raceStarted, ctx, outerWall, innerWall, sorted.indexOf(c));
        c.checkCollisions(cars);
        c.draw(ctx);
        if (c.laps > 10) {
            raceOver = true;
            document.getElementById('win-screen').style.display = 'block';
            document.getElementById('winner-name').innerText = `${c.name} WINS!`;
        }
    });
    
    ctx.restore();

    if(raceStarted && !raceOver) {
        document.getElementById('lap-display').innerText = `${player.laps}/10`;
        document.getElementById('speed-display').innerText = Math.round(player.speed * 38);
        document.getElementById('spotter').innerText = spotterText;
        document.getElementById('spotter').style.color = spotterColor;
        document.getElementById('board-content').innerHTML = sorted.slice(0, 10).map((c, i) => 
            `<div style="color:${c.isPlayer?'#ff0':'#fff'}">${i+1}. ${c.name}</div>`).join('');
    }
    requestAnimationFrame((t) => loop(t, ctx, canvas));
}