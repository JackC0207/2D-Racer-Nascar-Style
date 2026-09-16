var CONFIG = {
    CX: 750,
    CY: 350,
    STRAIGHT_LEN: 650,    
    HALF_STRAIGHT: 325,
    RADIUS_RIGHT: 230,    
    RADIUS_LEFT: 200      
};

var keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

var spotterText = "CLEAR";
var spotterColor = "#aaa";
var lastTime = performance.now();

class Car {
    constructor(p, isPlayer) {
        this.name = p.n; 
        this.isPlayer = isPlayer; 
        this.c1 = p.c1; 
        this.c2 = p.c2;
        
        this.x = CONFIG.CX + (Math.random() * 300 - 150);
        this.y = CONFIG.CY + CONFIG.RADIUS_RIGHT + (Math.random() * 20);
        this.angle = 0; 
        this.speed = 0; 
        
        this.accel = isPlayer ? 0.048 : 0.032; 
        this.friction = isPlayer ? 0.992 : 0.993;
        this.maxSpeed = isPlayer ? 3.0 : 2.4; 
        
        this.laps = 0;
        this.lastProgress = 0; 
        this.exactRankValue = 0;
        this.offset = (Math.random() * 40) - 70; 
        this.laneTimer = 0;
        this.sparks = [];
    }

    getLapProgress() {
        const circRight = Math.PI * CONFIG.RADIUS_RIGHT;
        const circLeft = Math.PI * CONFIG.RADIUS_LEFT;
        const straightDist = Math.hypot(CONFIG.STRAIGHT_LEN, Math.abs(CONFIG.RADIUS_RIGHT - CONFIG.RADIUS_LEFT));
        const totalLen = (straightDist * 2) + circRight + circLeft;
        const startX = CONFIG.CX - CONFIG.HALF_STRAIGHT;
        const endX = CONFIG.CX + CONFIG.HALF_STRAIGHT;
        let d = 0;
        if (this.y > CONFIG.CY && this.x >= startX && this.x <= endX) {
            d = (this.x - startX);
        } else if (this.x > endX) {
            let ang = Math.atan2(this.y - CONFIG.CY, this.x - endX) + Math.PI/2;
            if(ang < 0) ang += Math.PI * 2;
            d = straightDist + (ang * CONFIG.RADIUS_RIGHT);
        } else if (this.y <= CONFIG.CY && this.x >= startX && this.x <= endX) {
            d = straightDist + circRight + (endX - this.x);
        } else {
            let ang = (Math.PI/2) - Math.atan2(this.y - CONFIG.CY, this.x - startX);
            if(ang < 0) ang += Math.PI * 2;
            d = (straightDist * 2) + circRight + (ang * CONFIG.RADIUS_LEFT);
        }
        return d / totalLen;
    }

    update(all, dt, raceStarted, ctx, outer, inner, currentPos) {
        if (!raceStarted) return;
        let currentProgress = this.getLapProgress();
        let delta = currentProgress - this.lastProgress;
        if (delta < -0.5) this.laps++; 
        else if (delta > 0.5) this.laps--;
        this.lastProgress = currentProgress;
        this.exactRankValue = this.laps + currentProgress;
        let input = { up: false, down: false, left: false, right: false };
        if (this.isPlayer) {
            if (keys['KeyW'] || keys['ArrowUp']) input.up = true;
            if (keys['KeyS'] || keys['ArrowDown']) input.down = true;
            if (keys['KeyA'] || keys['ArrowLeft']) input.left = true;
            if (keys['KeyD'] || keys['ArrowRight']) input.right = true;
            this.runSpotter(all);
        } else { 
            this.simulateAI(input, dt); 
        }
        let accelVal = this.accel;
        if (input.up) this.speed += accelVal * dt;
        if (input.down) this.speed -= (this.accel * 2) * dt;
        let steerPower = (this.isPlayer ? 0.03 : 0.022) * (1.2 - (Math.abs(this.speed) / 4.0));
        if (input.left) this.angle -= steerPower * dt;
        if (input.right) this.angle += steerPower * dt;
        this.speed *= Math.pow(this.friction, dt);
        this.speed = Math.max(-1.0, Math.min(this.speed, this.maxSpeed));
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
        if (!ctx.isPointInPath(outer, this.x, this.y) || ctx.isPointInPath(inner, this.x, this.y)) {
            this.speed *= 0.9;
            if (Math.abs(this.speed) > 0.5) this.createSparks();
            let dx = this.x - CONFIG.CX, dy = this.y - CONFIG.CY, ang = Math.atan2(dy, dx);
            if (!ctx.isPointInPath(outer, this.x, this.y)) { this.x -= Math.cos(ang)*4; this.y -= Math.sin(ang)*4; }
            else { this.x += Math.cos(ang)*4; this.y += Math.sin(ang)*4; }
        }
        this.updateSparks(dt);
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
        else { spotterText = "CLEAR"; spotterColor = "#aaa"; }
    }

    simulateAI(input, dt) {
        this.laneTimer += dt;
        if (this.laneTimer > 300) { 
            this.offset = (Math.random() * 30) - 60; 
            this.laneTimer = 0; 
        }
        let tx, ty;
        const lookAhead = 100 + (this.speed * 15); 
        if (this.x > CONFIG.CX + CONFIG.HALF_STRAIGHT) {
            const tr = CONFIG.RADIUS_RIGHT + this.offset;
            let a = Math.atan2(this.y - CONFIG.CY, this.x - (CONFIG.CX + CONFIG.HALF_STRAIGHT)) - (lookAhead / tr);
            tx = (CONFIG.CX + CONFIG.HALF_STRAIGHT) + Math.cos(a) * tr; 
            ty = CONFIG.CY + Math.sin(a) * tr;
        } else if (this.x < CONFIG.CX - CONFIG.HALF_STRAIGHT) {
            const tr = CONFIG.RADIUS_LEFT + this.offset;
            let a = Math.atan2(this.y - CONFIG.CY, this.x - (CONFIG.CX - CONFIG.HALF_STRAIGHT)) - (lookAhead / tr);
            tx = (CONFIG.CX - CONFIG.HALF_STRAIGHT) + Math.cos(a) * tr; 
            ty = CONFIG.CY + Math.sin(a) * tr;
        } else {
            let progress = (this.x - (CONFIG.CX - CONFIG.HALF_STRAIGHT)) / CONFIG.STRAIGHT_LEN;
            let yRadiusBase = CONFIG.RADIUS_LEFT + (CONFIG.RADIUS_RIGHT - CONFIG.RADIUS_LEFT) * progress;
            let currentTrackRadius = yRadiusBase + this.offset;
            tx = (this.y > CONFIG.CY) ? this.x + lookAhead : this.x - lookAhead;
            ty = (this.y > CONFIG.CY) ? CONFIG.CY + currentTrackRadius : CONFIG.CY - currentTrackRadius;
        }
        let da = Math.atan2(ty - this.y, tx - this.x) - this.angle;
        while (da < -Math.PI) da += Math.PI * 2; 
        while (da > Math.PI) da -= Math.PI * 2;
        if (da < -0.01) input.left = true; 
        if (da > 0.01) input.right = true;
        input.up = Math.abs(da) < 0.5;
    }

    checkCollisions(all) {
        for (let other of all) {
            if (other === this) continue;
            if (Math.hypot(other.x - this.x, other.y - this.y) < 26) {
                const ang = Math.atan2(other.y - this.y, other.x - this.x);
                this.x -= Math.cos(ang) * 4; this.y -= Math.sin(ang) * 4;
                this.speed *= 0.85; this.createSparks(); return true; 
            }
        }
        return false;
    }

    createSparks() { for(let i=0; i<3; i++) this.sparks.push({ x:this.x, y:this.y, vx:(Math.random()-0.5)*6, vy:(Math.random()-0.5)*6, life:1 }); }
    updateSparks(dt) { for(let i=this.sparks.length-1; i>=0; i--) { let s = this.sparks[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.life-=0.06*dt; if(s.life<=0) this.sparks.splice(i,1); } }
    
    draw(ctx) {
        this.sparks.forEach(s => { ctx.fillStyle=`rgba(255,200,60,${s.life})`; ctx.fillRect(s.x, s.y, 2, 2); });
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        ctx.fillStyle = "#000"; ctx.fillRect(-15, -9, 30, 18);
        ctx.fillStyle = this.c1; ctx.fillRect(-14, -8, 28, 16);
        ctx.fillStyle = this.c2; 
        ctx.fillRect(-13, -8, 26, 1.5);   
        ctx.fillRect(-13, 6.5, 26, 1.5);  
        ctx.fillStyle = "#000"; 
        ctx.fillRect(1, -6, 6, 12);   
        ctx.fillRect(-9, -6, 4, 12);  
        ctx.fillRect(-3, -8, 5, 2);   
        ctx.fillRect(-3, 6, 5, 2);    
        ctx.restore();
    }
}

function createPath(w, rRight, rLeft) {
    const p = new Path2D();
    p.moveTo(CONFIG.CX - w/2, CONFIG.CY - rLeft);
    p.lineTo(CONFIG.CX + w/2, CONFIG.CY - rRight);
    p.arc(CONFIG.CX + w/2, CONFIG.CY, rRight, -Math.PI/2, Math.PI/2);
    p.lineTo(CONFIG.CX - w/2, CONFIG.CY + rLeft);
    p.arc(CONFIG.CX - w/2, CONFIG.CY, rLeft, Math.PI/2, Math.PI * 1.5);
    p.closePath(); return p;
}

const outerWall = createPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS_RIGHT + 85, CONFIG.RADIUS_LEFT + 85);
const innerWall = createPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS_RIGHT - 75, CONFIG.RADIUS_LEFT - 75);

function loop(time, ctx, canvas) {
    let dt = (time - lastTime) / 8; if (dt > 4) dt = 4; lastTime = time;
    if(raceOver) return;
    ctx.save();
    ctx.fillStyle = "#111"; ctx.fillRect(0,0,1500,700);
    ctx.fillStyle = "#1e3d1a"; ctx.fill(innerWall);
    ctx.strokeStyle = "#333"; ctx.lineWidth = 160; 
    ctx.stroke(createPath(CONFIG.STRAIGHT_LEN, CONFIG.RADIUS_RIGHT, CONFIG.RADIUS_LEFT));
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.stroke(outerWall); ctx.stroke(innerWall);
    const sorted = [...cars].sort((a,b) => b.exactRankValue - a.exactRankValue);
    cars.forEach(c => {
        c.update(cars, dt, raceStarted, ctx, outerWall, innerWall, sorted.indexOf(c));
        c.checkCollisions(cars);
        c.draw(ctx);
    });
    ctx.restore();
    if (sorted[0] && sorted[0].laps >= 16 && !raceOver) {
        raceOver = true;
        document.getElementById('win-screen').style.display = 'block';
        document.getElementById('winner-name').innerText = `${sorted[0].name} HAS WON!`;
    }
    if(raceStarted && !raceOver) {
        const p = cars.find(c => c.isPlayer);
        if (p) {
            document.getElementById('lap-display').innerText = `${Math.min(15, p.laps)}/15`;
            document.getElementById('speed-display').innerText = Math.round(p.speed * 85);
        }
        let sUI = document.getElementById('spotter'); // Changed ID to match Daytona
        if(sUI) {
            sUI.innerText = spotterText;
            sUI.style.color = spotterColor;
        }
        document.getElementById('board-content').innerHTML = sorted.slice(0, 12).map((c, i) => 
            `<div style="color:${c.isPlayer?'#ffff00':'#fff'}"><span>${i+1} ${c.name}</span></div>`).join('');
    }
    requestAnimationFrame((t) => loop(t, ctx, canvas));
}