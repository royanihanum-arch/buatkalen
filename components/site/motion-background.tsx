'use client'

import { useEffect, useRef } from 'react'

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uScroll;

float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}

float map(vec3 p){
  float t=uTime*.35;
  p.xz*=rot(uMouse.x*.6+t*.15);
  p.yz*=rot(uMouse.y*.4);
  float d=length(p)-1.05;
  d+=.045*sin(p.x*4.+t*2.)*sin(p.y*4.+t*1.7)*sin(p.z*4.+t*1.3);
  for(int i=0;i<4;i++){
    float fi=float(i);
    vec3 o=vec3(sin(t*1.1+fi*1.7)*1.55,cos(t*.9+fi*2.3)*.95,sin(t*.7+fi*.9)*1.2);
    d=smin(d,length(p-o)-(.32+.08*fi),.55);
  }
  return d;
}

vec3 normal(vec3 p){vec2 e=vec2(.0015,0.);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}

vec3 env(vec3 r){
  float y=r.y*.5+.5;
  vec3 c=mix(vec3(.004,.006,.012),vec3(.03,.05,.08),y);
  c+=vec3(.6,.92,1.)*pow(max(dot(r,normalize(vec3(-.6,.7,.3))),0.),24.)*1.6;
  c+=vec3(1.,.98,.95)*pow(max(dot(r,normalize(vec3(.8,.35,-.4))),0.),60.)*2.2;
  c+=vec3(.35,.25,.9)*pow(max(dot(r,normalize(vec3(.2,-.8,.5))),0.),8.)*.35;
  float strip=smoothstep(.96,1.,abs(sin(r.x*3.+r.y*1.5)))*smoothstep(0.,.6,r.y);
  return c+strip*vec3(.25,.35,.4);
}

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  vec3 ro=vec3(0.,0.,4.6+uScroll*1.5);
  vec3 rd=normalize(vec3(uv,-1.55));
  float t=0.;float hit=0.;
  for(int i=0;i<84;i++){
    float d=map(ro+rd*t);
    if(d<.001){hit=1.;break;}
    t+=d*.9;
    if(t>12.)break;
  }
  vec3 col=env(rd)*.35;
  float vign=1.-.55*dot(uv,uv);
  if(hit>0.){
    vec3 p=ro+rd*t;vec3 n=normal(p);
    vec3 r=reflect(rd,n);
    float fres=pow(1.-max(dot(n,-rd),0.),3.);
    vec3 irid=.5+.5*cos(6.2831*(fres*.9+vec3(.0,.33,.67))+uTime*.2);
    vec3 refl=env(r);
    col=refl*mix(vec3(.08),vec3(1.),fres*.85+.15);
    col+=irid*fres*.22;
    col+=vec3(.6,.92,1.)*pow(max(dot(n,normalize(vec3(-.4,.6,.7))),0.),2.)*.05;
  }
  col*=vign;
  col=col/(1.+col);
  col=pow(col,vec3(.4545));
  float grain=fract(sin(dot(gl_FragCoord.xy+uTime,vec2(12.9898,78.233)))*43758.5453);
  col+=(grain-.5)*.025;
  gl_FragColor=vec4(col,1.);
}`

export function MotionBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, powerPreference: 'high-performance', alpha: false })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, 'uRes')
    const uTime = gl.getUniformLocation(program, 'uTime')
    const uMouse = gl.getUniformLocation(program, 'uMouse')
    const uScroll = gl.getUniformLocation(program, 'uScroll')

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const target = { x: 0, y: 0 }
    const mouse = { x: 0, y: 0 }
    let scroll = 0

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio, 1.5) * (window.innerWidth > 1400 ? 0.6 : 0.75)
      canvas.width = Math.floor(window.innerWidth * scale)
      canvas.height = Math.floor(window.innerHeight * scale)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uRes, canvas.width, canvas.height)
    }
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2
      target.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })

    let raf = 0
    const start = performance.now()
    const frame = (now: number) => {
      mouse.x += (target.x - mouse.x) * 0.04
      mouse.y += (target.y - mouse.y) * 0.04
      scroll += (Math.min(window.scrollY / window.innerHeight, 1.5) - scroll) * 0.08
      gl.uniform1f(uTime, reduced ? 8 : (now - start) / 1000)
      gl.uniform2f(uMouse, mouse.x, mouse.y)
      gl.uniform1f(uScroll, scroll)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!reduced) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !reduced) raf = requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-black">
      <canvas ref={canvasRef} className="h-full w-full animate-in fade-in duration-1000" />
    </div>
  )
}
