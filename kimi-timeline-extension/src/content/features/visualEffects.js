/**
 * Visual Effects - 视觉效果功能
 * 提供雪花、樱花、雨滴等视觉效果
 */

import { createElement } from '../../utils/dom.js';

export class VisualEffects {
  constructor(effectType = 'none') {
    this.effectType = effectType;
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animationId = null;
    this.isActive = false;
  }

  async init() {
    if (this.effectType === 'none') return;
    
    console.log(`🎨 Initializing Visual Effect: ${this.effectType}`);
    
    this.createCanvas();
    this.setupParticles();
    this.startAnimation();
    this.isActive = true;
  }

  createCanvas() {
    this.canvas = createElement('canvas', {
      className: 'kimi-voyager-effects-canvas',
      styles: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '9998'
      }
    });

    document.body.appendChild(this.canvas);
    
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    
    // 监听窗口大小变化
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  setupParticles() {
    this.particles = [];
    const count = this.getParticleCount();

    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle());
    }
  }

  getParticleCount() {
    switch (this.effectType) {
      case 'snow': return 150;
      case 'sakura': return 80;
      case 'rain': return 200;
      default: return 0;
    }
  }

  createParticle() {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    switch (this.effectType) {
      case 'snow':
        return {
          x: Math.random() * canvasWidth,
          y: Math.random() * canvasHeight,
          radius: Math.random() * 3 + 1,
          speed: Math.random() * 1 + 0.5,
          opacity: Math.random() * 0.5 + 0.3,
          drift: Math.random() * 2 - 1
        };

      case 'sakura':
        return {
          x: Math.random() * canvasWidth,
          y: Math.random() * canvasHeight,
          size: Math.random() * 8 + 4,
          speed: Math.random() * 1.5 + 0.5,
          rotation: Math.random() * 360,
          rotationSpeed: Math.random() * 2 - 1,
          sway: Math.random() * 2 - 1,
          opacity: Math.random() * 0.4 + 0.3,
          color: this.getRandomPink()
        };

      case 'rain':
        return {
          x: Math.random() * canvasWidth,
          y: Math.random() * canvasHeight,
          length: Math.random() * 20 + 10,
          speed: Math.random() * 15 + 10,
          opacity: Math.random() * 0.3 + 0.1
        };

      default:
        return {};
    }
  }

  getRandomPink() {
    const colors = ['#ffb7c5', '#ffc0cb', '#ff69b4', '#ff1493', '#db7093'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  startAnimation() {
    const animate = () => {
      if (!this.isActive) return;
      
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      switch (this.effectType) {
        case 'snow':
          this.drawSnow();
          break;
        case 'sakura':
          this.drawSakura();
          break;
        case 'rain':
          this.drawRain();
          break;
      }
      
      this.animationId = requestAnimationFrame(animate);
    };
    
    animate();
  }

  drawSnow() {
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    
    this.particles.forEach(particle => {
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
      this.ctx.fill();

      // 更新位置
      particle.y += particle.speed;
      particle.x += particle.drift;

      // 边界检查
      if (particle.y > this.canvas.height) {
        particle.y = -10;
        particle.x = Math.random() * this.canvas.width;
      }
      if (particle.x > this.canvas.width) {
        particle.x = 0;
      } else if (particle.x < 0) {
        particle.x = this.canvas.width;
      }
    });
  }

  drawSakura() {
    this.particles.forEach(particle => {
      this.ctx.save();
      this.ctx.translate(particle.x, particle.y);
      this.ctx.rotate((particle.rotation * Math.PI) / 180);
      
      // 绘制樱花花瓣
      this.ctx.beginPath();
      this.ctx.fillStyle = particle.color;
      this.ctx.globalAlpha = particle.opacity;
      
      // 绘制五瓣花瓣
      for (let i = 0; i < 5; i++) {
        this.ctx.rotate((Math.PI * 2) / 5);
        this.ctx.ellipse(0, particle.size / 2, particle.size / 4, particle.size / 2, 0, 0, Math.PI * 2);
      }
      
      this.ctx.fill();
      this.ctx.restore();

      // 更新位置
      particle.y += particle.speed;
      particle.x += Math.sin(particle.y / 50) * particle.sway;
      particle.rotation += particle.rotationSpeed;

      // 边界检查
      if (particle.y > this.canvas.height) {
        particle.y = -20;
        particle.x = Math.random() * this.canvas.width;
      }
    });
  }

  drawRain() {
    this.ctx.strokeStyle = 'rgba(174, 194, 224, 0.5)';
    this.ctx.lineWidth = 1;
    
    this.particles.forEach(particle => {
      this.ctx.beginPath();
      this.ctx.moveTo(particle.x, particle.y);
      this.ctx.lineTo(particle.x, particle.y + particle.length);
      this.ctx.strokeStyle = `rgba(174, 194, 224, ${particle.opacity})`;
      this.ctx.stroke();

      // 更新位置
      particle.y += particle.speed;

      // 边界检查
      if (particle.y > this.canvas.height) {
        particle.y = -particle.length;
        particle.x = Math.random() * this.canvas.width;
      }
    });
  }

  setEffect(effectType) {
    if (this.effectType === effectType) return;
    
    // 停止当前效果
    this.stop();
    
    this.effectType = effectType;
    
    if (effectType !== 'none') {
      this.setupParticles();
      this.startAnimation();
      this.isActive = true;
    }
  }

  stop() {
    this.isActive = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  destroy() {
    this.stop();
    if (this.canvas) {
      this.canvas.remove();
    }
  }
}
