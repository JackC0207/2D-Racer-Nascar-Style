var CONFIG = {
    CX: 750,
    CY: 350,
    STRAIGHT_LEN: 800,
    RADIUS: 180,
    HALF_STRAIGHT: 400
};

var keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

var spotterText = "CLEAR";
var spotterColor = "#aaa";
var lastTime = performance.now(); // Added to ensure loop timing works

class Car {
    constructor(p, isPlayer) {
        this.name = p.n; 
        this.isPlayer = isPlayer; 
        this.c1 = p.c1; 
        this.c2 = p.c2;
        
        this.x = CONFIG.CX + (Math.random() * 400 - 200);
        this.y = CONFIG.CY + CONFIG.RADIUS + (Math.random() * 15);
        this.angle = 0; 
        this.speed = 0; 
        
        this.accel = isPlayer ? 0.042 : 0.045; 
        this.friction = isPlayer ? 0.991 : 0.993;
        this.maxSpeed = isPlayer ? 2.85 : 2.9; 
        
        this.laps = 0;
        this.passedMid = false;
        this.exactRankValue = 0;
        this.offset = (Math.random() * 30) - 65; 
        this.laneTimer = 0;
        this.sparks = [];
    }

    getLapProgress() {
        const circ = Math.PI * CONFIG.RADIUS;
        const totalLen = (CONFIG.STRAIGHT_LEN * 2) + (circ * 2);
        const startX = CONFIG.CX - CONFIG.HALF_STRAIGHT;
        const endX = CONFIG.CX + CONFIG.HALF_STRAIGHT;

        if (this.y > CONFIG.CY && this.x >= startX && this.x <= endX) return (this.x - startX) / totalLen;
        if (this.x > endX) {
            let ang = Math.atan2(this.y - CONFIG.CY, this.x - endX) + Math.PI/2;
            if(ang < 0) ang += Math.PI * 2;
            return (CONFIG.STRAIGHT_LEN + ang * CONFIG.RADIUS) / totalLen;
        }
        if (this.y <= CONFIG.CY && this.x >= startX && this.x <= endX) return (CONFIG.STRAIGHT_LEN + circ + (endX - this.x)) / totalLen;
        let ang = (Math.PI/2) - Math.atan2(this.y - CONFIG.CY, this.x - startX);
        if(ang < 0) ang += Math.PI * 2;
        return (CONFIG.STRAIGHT_LEN * 2 + circ + ang * CONFIG.RADIUS) / totalLen;
    }

    update(all, dt, raceStarted, ctx, outer, inner, currentPos) {
        if (!raceStarted) return;
        this.exactRankValue = this.laps + this.getLapProgress();
        
        let input = { up: false, down: false, left: false, right: false };
        let speedBoost = (currentPos >= 7) ? 0.25 : 0;

        if (this.isPlayer) {
            if (keys['KeyW'] || keys['ArrowUp']) input.up = true;
            if (keys['KeyS'] || keys['ArrowDown']) input.down = true;
            if (keys['KeyA'] || keys['ArrowLeft']) input.left = true;
            if (keys['KeyD'] || keys['ArrowRight']) input.right = true;
            this.runSpotter(all, speedBoost);
        } else { 
            this.simulateAI(input, dt); 
        }

        let accelVal = this.accel + (this.isPlayer ? 0 : (speedBoost * 0.05));
        if (input.up) this.speed += accelVal * dt;
        if (input.down) this.speed -= (this.accel * 2) * dt;
        
        let steerPower = (this.isPlayer ? 0.028 : 0.025) * (1.2 - (Math.abs(this.speed) / 3.5));
        if (input.left) this.angle -= steerPower * dt;
        if (input.right) this.angle += steerPower * dt;

        this.speed *= Math.pow(this.friction, dt);
        this.speed = Math.max(-1.1, Math.min(this.speed, this.maxSpeed + speedBoost));
        
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;

        if (!ctx.isPointInPath(outer, this.x, this.y) || ctx.isPointInPath(inner, this.x, this.y)) {
            this.speed *= 0.92;
            if (Math.abs(this.speed) > 0.5) this.createSparks();
            let dx = this.x - CONFIG.CX, dy = this.y - CONFIG.CY, ang = Math.atan2(dy, dx);
            if (!ctx.isPointInPath(outer, this.x, this.y)) { this.x -= Math.cos(ang)*3; this.y -= Math.sin(ang)*3; }
            else { this.x += Math.cos(ang)*3; this.y += Math.sin(ang)*3; }
        }

        if (this.y < CONFIG.CY - 100) this.passedMid = true;
        if (this.passedMid && this.y > CONFIG.CY + 100 && Math.abs(this.x - CONFIG.CX) < 100) { 
            this.laps++; 
            this.passedMid = false; 
        }
        this.updateSparks(dt);
    }

    runSpotter(all, isBoosting) {
        let inside = false, outside = false;
        all.forEach(other => {
            if (other === this) return;
            let d = Math.hypot(other.x - this.x, other.y - this.y);
            if (d < 90) { // Increased range to match Daytona/Bristol
                let relAng = Math.atan2(other.y - this.y, other.x - this.x) - this.angle;
                while (relAng < -Math.PI) relAng += Math.PI * 2;
                while (relAng > Math.PI) relAng -= Math.PI * 2;
                // Added thresholds so it only triggers when actually alongside
                if (relAng < -0.4) inside = true;
                if (relAng > 0.4) outside = true;
            }
        });

        if (inside && outside) { spotterText = "3 WIDE!"; spotterColor = "#ff0000"; }
        else if (inside) { spotterText = "CAR LOW"; spotterColor = "#ffff00"; }
        else if (outside) { spotterText = "CAR HIGH"; spotterColor = "#ffff00"; }
        else if (isBoosting > 0) { spotterText = "BOOSTING!"; spotterColor = "#00ff00"; }
        else { spotterText = "CLEAR"; spotterColor = "#aaa"; }
    }

    simulateAI(input, dt) {
        this.laneTimer += dt;
        if (this.laneTimer > 200) { 
            this.offset = (Math.random() * 30) - 65; 
            this.laneTimer = 0; 
        }
        const tr = CONFIG.RADIUS + this.offset;
        let tx, ty;
        const lookAhead = 55 + (this.speed * 10); 
        
        if (this.x > CONFIG.CX + CONFIG.HALF_STRAIGHT) {
            let a = Math.atan2(this.y - CONFIG.CY, this.x - (CONFIG.CX + CONFIG.HALF_STRAIGHT)) - (lookAhead / tr);
            tx = (CONFIG.CX + CONFIG.HALF_STRAIGHT) + Math.cos(a) * tr; 
            ty = CONFIG.CY + Math.sin(a) * tr;
        } else if (this.x < CONFIG.CX - CONFIG.HALF_STRAIGHT) {
            let a = Math.atan2(this.y - CONFIG.CY, this.x - (CONFIG.CX - CONFIG.HALF_STRAIGHT)) - (lookAhead / tr);
            tx = (CONFIG.CX - CONFIG.HALF_STRAIGHT) + Math.cos(a) * tr; 
            ty = CONFIG.CY + Math.sin(a) * tr;
        } else {
            tx = (this.y > CONFIG.CY) ? this.x + lookAhead : this.x - lookAhead;
            ty = (this.y > CONFIG.CY) ? CONFIG.CY + tr : CONFIG.CY - tr;
        }

        let da = Math.atan2(ty - this.y, tx - this.x) - this.angle;
        while (da < -Math.PI) da += Math.PI * 2; 
        while (da > Math.PI) da -= Math.PI * 2;
        
        if (da < -0.01) input.left = true; 
        if (da > 0.01) input.right = true;
        input.up = Math.abs(da) < 0.3; 
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

function createPath(w, r) {
    const p = new Path2D();
    p.moveTo(CONFIG.CX - w/2, CONFIG.CY - r); p.lineTo(CONFIG.CX + w/2, CONFIG.CY - r);
    p.arc(CONFIG.CX + w/2, CONFIG.CY, r, -Math.PI/2, Math.PI/2);
    p.lineTo(CONFIG.CX - w/2, CONFIG.CY + r);
    p.arc(CONFIG.CX - w/2, CONFIG.CY, r, Math.PI/2, -Math.PI/2);
    p.closePath(); return p;
}

const outerWall = createPath(CONFIG.STRAIGHT_LEN, 260);
const innerWall = createPath(CONFIG.STRAIGHT_LEN, 100);
var shake = 0;

function loop(time, ctx, canvas) {
    let dt = (time - lastTime) / 8; if (dt > 4) dt = 4; lastTime = time;
    if(raceOver) return;
    
    ctx.save();
    if (shake > 0) { ctx.translate(Math.random()*shake - shake/2, Math.random()*shake - shake/2); shake *= 0.9; }
    
    ctx.fillStyle = "#111"; ctx.fillRect(0,0,1500,700);
    ctx.fillStyle = "#1e3d1a"; ctx.fill(innerWall);
    ctx.strokeStyle = "#333"; ctx.lineWidth = 160; ctx.stroke(createPath(CONFIG.STRAIGHT_LEN, 180));
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.stroke(outerWall); ctx.stroke(innerWall);

    const sorted = [...cars].sort((a,b) => b.exactRankValue - a.exactRankValue);
    
    cars.forEach(c => {
        c.update(cars, dt, raceStarted, ctx, outerWall, innerWall, sorted.indexOf(c));
        if (c.checkCollisions(cars) && c.isPlayer) shake = 5;
        c.draw(ctx);
        if (c.laps > 15) {
            raceOver = true;
            document.getElementById('win-screen').style.display = 'block';
            document.getElementById('winner-name').innerText = `${c.name} HAS WON!`;
        }
    });
    ctx.restore();

    if(raceStarted && !raceOver) {
        const p = cars.find(c => c.isPlayer);
        document.getElementById('lap-display').innerText = `${Math.min(15, p.laps)}/15`;
        document.getElementById('speed-display').innerText = Math.round(p.speed * 85);
        
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