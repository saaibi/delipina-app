import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { roadMatrix } from "../dist-server/road-matrix.js";
test("Cliente OSRM real sobre HTTP: serialización, error HTTP y matriz inválida", async () => {
  let count = 0;
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url!);
    count++;
    res.setHeader("Content-Type", "application/json");
    if (count === 1)
      res.end(
        JSON.stringify({
          code: "Ok",
          durations: [
            [0, 40],
            [30, 0],
          ],
        }),
      );
    else if (count === 2) {
      res.statusCode = 503;
      res.end("{}");
    } else
      res.end(
        JSON.stringify({
          code: "Ok",
          durations: [
            [0, -1],
            [30, 0],
          ],
        }),
      );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const points = [
      { lat: 7.13488, lng: -73.12438 },
      { lat: 7.1, lng: -73.1 },
    ];
    assert.deepEqual(await roadMatrix(points, base, false), [
      [0, 40],
      [30, 0],
    ]);
    assert.ok(requests[0].startsWith("/table/v1/driving/-73.124380,7.134880;"));
    assert.ok(requests[0].includes("annotations=duration"));
    await assert.rejects(roadMatrix(points, base, false));
    await assert.rejects(roadMatrix(points, base, false));
    assert.equal(count, 3);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
import { geocode } from "../dist-server/geocoder.js";
test("Búsqueda Photon real sobre HTTP: coordenadas, filtros de país y fallos visibles", async () => {
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    const url = new URL(req.url!, "http://localhost");
    assert.equal(url.searchParams.get("countrycode"), "CO");
    assert.equal(url.searchParams.get("limit"), "5");
    res.setHeader("Content-Type", "application/json");
    if (calls === 1)
      res.end(
        JSON.stringify({
          features: [
            {
              geometry: { type: "Point", coordinates: [-73.12, 7.13] },
              properties: { name: "Plaza de prueba", city: "Bucaramanga" },
            },
          ],
        }),
      );
    else {
      res.statusCode = 503;
      res.end("{}");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const base = "http://127.0.0.1:" + (server.address() as any).port + "/api";
    const found = await geocode("Plaza de prueba", base, false);
    assert.equal(found[0].lat, 7.13);
    assert.equal(found[0].lng, -73.12);
    assert.ok(found[0].label.includes("Bucaramanga"));
    await assert.rejects(geocode("Otra plaza", base, false));
    assert.equal(calls, 2);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

import { roadGeometry } from "../dist-server/road-matrix.js";
test("Trazado completo conserva las cinco paradas y rechaza geometría inválida", async () => {
  let calls = 0;
  const points = Array.from({ length: 6 }, (_, i) => ({
    lat: 7.1 + i / 100,
    lng: -73.1 - i / 100,
  }));
  const coordinates = points.map((p) => [p.lng, p.lat]);
  const server = createServer((req, res) => {
    calls++;
    assert.equal(
      new URL(req.url!, "http://localhost").pathname
        .split("/")
        .at(-1)!
        .split(";").length,
      6,
    );
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        code: "Ok",
        routes: [
          {
            geometry: {
              type: "LineString",
              coordinates:
                calls === 1
                  ? coordinates
                  : [
                      [999, 7],
                      [-73, 8],
                    ],
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const base = "http://127.0.0.1:" + (server.address() as any).port;
    assert.deepEqual(
      (await roadGeometry(points, base, false)).coordinates,
      coordinates,
    );
    await assert.rejects(roadGeometry(points, base, false));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
import { numberedAddress } from "../dist-server/address-query.js";
test("Búsqueda espera numeración completa y prioriza números coincidentes",async()=>{
 assert.equal(numberedAddress("Carrera 23"),null);assert.equal(numberedAddress("Carrera 23 #6-"),null);
 assert.equal(numberedAddress("carrea 23 #6-68")?.house,"6-68");assert.equal(numberedAddress("Cra. 23 # 6 - 68")?.street,"Carrera 23");
 const server=createServer((req,res)=>{
  const url=new URL(req.url!,"http://localhost");assert.equal(url.searchParams.get("q"),"Carrera 23 6-68, Bucaramanga, Colombia");
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify({features:[{geometry:{type:"Point",coordinates:[-73.1,7.1]},properties:{street:"Carrera 23",city:"Bucaramanga"}},{geometry:{type:"Point",coordinates:[-73.11,7.11]},properties:{street:"Carrera 23",housenumber:"6-68",city:"Bucaramanga"}}]}));
 });
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 try {const found=await geocode("carrea 23 #6-68, Bucaramanga, Colombia","http://127.0.0.1:"+(server.address() as any).port,false);assert.equal(found[0].precision,"number");assert.equal(found[1].precision,"approximate");}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('Búsqueda de sucursal descarta resultados de otro municipio',async()=>{
 const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({features:['Bogotá','Bucaramanga'].map(city=>({geometry:{type:'Point',coordinates:[-73.1,7.1]},properties:{street:'Calle 45',housenumber:'18-32',city}}))}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try {const found=await geocode('Calle 45 #18-32, Bucaramanga, Colombia','http://127.0.0.1:'+(server.address() as any).port,false,'Bucaramanga');assert.equal(found.length,1);assert.equal(found[0].numberMatch,true);assert.ok(found[0].label.includes('Bucaramanga'));}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('Dirección colombiana con abreviatura y barrio conserva placa completa',()=>{const p=numberedAddress('Cl. 43 #26-106, POBLADO, Girón, Santander');assert.equal(p?.street,'Calle 43');assert.equal(p?.house,'26-106');assert.equal(numberedAddress('Cl.43 #26-106')?.street,'Calle 43');});
