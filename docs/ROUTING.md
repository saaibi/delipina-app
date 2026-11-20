OSRM/FOSSGIS routing integration evidence
- Official HTTP contract: https://project-osrm.org/docs/v26.6.1/http (Table service).
- Provider policy: https://routing.openstreetmap.de/about.html ; max 1 request/sec, valid User-Agent, attribution and fix-map link.
- Public plaza origin reference: https://www.bucaramanga.gov.co/wp-content/uploads/2022/04/OATIC-I-TRIMESTRE-2022.-FINAL-rvWG.pdf ; 7.13488,-73.12438.
- Local HTTP stand-in: tests/road-matrix.test.ts. Real fetch exercised successful asymmetric matrix, HTTP503 and invalid negative matrix; no user/customer data used.
- Actual free provider check: public plaza to public city reference, outbound221.8s/return233.3s on 2026-11-20. Establishes endpoint response, not real delivery time or traffic.
- Postman CLI unavailable in this workspace; existing Node HTTP integration harness used without creating an external mock workspace.
- Explicit address search uses Photon, cached seven days and serialized; clients/admins can choose a map point. Official contract: https://github.com/komoot/photon/blob/master/docs/api-v1.md . Demo markers remain fictitious, not validated door locations.
- Route groups use geographic clustering, max5; exhaustive open path per group (<=120 alternatives). No claim of a global optimal fleet assignment. Provider failures fallback explicitly to geographic distance; no fabricated road ETA.

- Full-route map uses OSRM Route GeoJSON, cached one day with the shared 1.1-second provider queue. HTTP stand-in verifies all six coordinates (origin + five stops), valid geometry and malformed-response rejection. Missing coordinates preserve the stop list; provider failure shows pins and a warning.
- Leaflet/OpenStreetMap tiles retain attribution and a strict-origin-when-cross-origin referrer. No offline tile prefetch. Policy: https://operations.osmfoundation.org/policies/tiles/ .
- Unstarted runs may regroup. Manual edits and batch departure enforce ownership and readiness in database transactions; requested groups require admin approval. Started runs freeze membership and locations.
