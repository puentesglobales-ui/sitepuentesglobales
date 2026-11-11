import { Router } from 'express';
import crypto from 'node:crypto';
import { requireUser } from '../services/usage.js';
import { seleccionar, insertar, actualizar, adminDisponible } from '../services/supabaseAdmin.js';
import { BANCO_CI, publicCI, estimarCI, categoriaCI } from '../services/bancoCI.js';
import { BANCO_RAZONAMIENTO, publicRazonamiento } from '../services/bancoRazonamiento.js';

const router = Router();
const TESTS = { ci: BANCO_CI, razonamiento: BANCO_RAZONAMIENTO };
const cantidades = { ci: 24, razonamiento: 15 };
const mezcla = a => { const r=[...a]; for(let i=r.length-1;i>0;i--){const j=crypto.randomInt(i+1);[r[i],r[j]]=[r[j],r[i]];} return r; };
const opcionesPublicas = (test, q) => test === 'ci' ? publicCI(q) : publicRazonamiento(q);
function elegir(test) {
  const banco = TESTS[test];
  if (test === 'ci') {
    const porArea = Object.groupBy ? Object.groupBy(banco, q => q.bloque) : banco.reduce((o,q)=>(o[q.bloque]??=[]).push(q)&&o,{});
    return mezcla(Object.values(porArea).flatMap(xs => mezcla(xs).slice(0, 6)));
  }
  return mezcla(banco).slice(0, cantidades[test]);
}
function idTexto(id) { return encodeURIComponent(String(id)); }
function validarRespuestas(respuestas) { return respuestas && typeof respuestas === 'object' && !Array.isArray(respuestas); }
function resultadoCI(preguntas, respuestas) {
  const correctas = preguntas.filter(p => Number.isInteger(Number(respuestas[p.id])) && p.opciones[Number(respuestas[p.id])] === p.correcta).map(p=>p.id);
  const aciertos = correctas.length;
  const ci = estimarCI(aciertos);
  const porBloque = ['Matrices','Series','Verbal','Lógica'].map(b => { const xs=preguntas.filter(p=>p.bloque===b); return { bloque:b, ok:xs.filter(p=>correctas.includes(p.id)).length, total:xs.length }; });
  return { puntaje: aciertos, maximo: preguntas.length, detalle: { ci_estimado: ci, categoria: categoriaCI(ci), por_bloque: porBloque, respuestas: preguntas.map(p=>({id:p.id,ok:correctas.includes(p.id)})) } };
}
function resultadoRazonamiento(preguntas, respuestas) {
  const ids = preguntas.filter(p => p.opciones[Number(respuestas[p.id])] === p.correcta).map(p=>p.id);
  const nivel = ids.length <= 5 ? 'Nivel inicial 🌱' : ids.length <= 10 ? 'Nivel intermedio 📈' : 'Nivel avanzado 🏆';
  return { puntaje:ids.length, maximo:preguntas.length, detalle:{ nivel, respuestas:preguntas.map(p=>({id:p.id,ok:ids.includes(p.id)})) } };
}
router.post('/:test/iniciar', requireUser, async (req,res) => {
  const { test } = req.params;
  if (!TESTS[test]) return res.status(400).json({success:false,error:'Test desconocido.'});
  if (!adminDisponible()) return res.status(503).json({success:false,error:'Falta configurar SUPABASE_SECRET_KEY en el servidor.'});
  try {
    const selected = elegir(test);
    const anteriores = await seleccionar('pg_intentos_test', `select=preguntas&user_id=eq.${idTexto(req.user.id)}&test=eq.${test}&order=created_at.desc&limit=1`);
    const anterior = anteriores[0]?.preguntas;
    let preguntas = selected.map(q => ({ id:q.id, opciones:mezcla(q.opciones) }));
    if (anterior && JSON.stringify(preguntas) === JSON.stringify(anterior)) {
      preguntas = preguntas.map(p => p.opciones.length > 1 ? { ...p, opciones: [...p.opciones.slice(1), p.opciones[0]] } : p);
    }
    const ahora = new Date().toISOString();
    const [fila] = await insertar('pg_intentos_test', [{ id:crypto.randomUUID(), user_id:req.user.id, test, preguntas, created_at:ahora }], { devolver:true });
    const byId = new Map(selected.map(q=>[String(q.id),q]));
    const publicas = preguntas.map(p => {
      const q=byId.get(String(p.id));
      return { ...opcionesPublicas(test,q), id:q.id, opciones:p.opciones };
    });
    res.json({success:true,intento_id:fila?.id, preguntas:publicas, segundos_limite:test==='ci'?1200:null});
  } catch(err) { console.error(`tests/${test}/iniciar:`,err.message); res.status(500).json({success:false,error:'No pudimos preparar el test.'}); }
});
router.post('/:test/entregar', requireUser, async (req,res) => {
  const { test }=req.params; const { intento_id, respuestas }=req.body||{};
  if (!TESTS[test] || !intento_id || !validarRespuestas(respuestas)) return res.status(400).json({success:false,error:'Datos inválidos.'});
  if (!adminDisponible()) return res.status(503).json({success:false,error:'Falta configurar SUPABASE_SECRET_KEY en el servidor.'});
  try {
    const rows=await seleccionar('pg_intentos_test',`select=*&id=eq.${idTexto(intento_id)}&user_id=eq.${idTexto(req.user.id)}&test=eq.${test}&limit=1`);
    const intento=rows[0]; if(!intento) return res.status(404).json({success:false,error:'Intento no encontrado.'});
    if(intento.entregado_at) return res.status(409).json({success:false,error:'Este intento ya fue entregado.'});
    const banco = new Map(TESTS[test].map(q=>[String(q.id),q]));
    const ordered = (intento.preguntas||[]).map(saved=>{ const q=banco.get(String(saved.id)); return q ? {...q, opciones:saved.opciones} : null; }).filter(Boolean);
    const r=test==='ci'?resultadoCI(ordered,respuestas):resultadoRazonamiento(ordered,respuestas);
    const ahora=new Date().toISOString();
    await insertar('pg_resultados_test',[{user_id:req.user.id,test,puntaje:r.puntaje,maximo:r.maximo,detalle:r.detalle,created_at:ahora}],{});
    await actualizar('pg_intentos_test',`id=eq.${idTexto(intento_id)}&user_id=eq.${idTexto(req.user.id)}&entregado_at=is.null`,{entregado_at:ahora},{devolver:false});
    const revision=ordered.map(q=>({id:q.id, enunciado:q.enunciado, bloque:q.bloque, correcta:q.correcta, opciones:q.opciones, respuesta:respuestas[q.id] ?? null, explicacion:q.explicacion, ...(q.svg?{svg:q.svg}: {})}));
    res.json({success:true,puntaje:r.puntaje,maximo:r.maximo,detalle:r.detalle,revision});
  } catch(err) { console.error(`tests/${test}/entregar:`,err.message); res.status(500).json({success:false,error:'No pudimos corregir el test.'}); }
});
export default router;
