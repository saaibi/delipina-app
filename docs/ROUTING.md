OSRM/FOSSGIS routing integration evidence
- Official HTTP contract: https://project-osrm.org/docs/v26.6.1/http (Table service).
- Provider policy: https://routing.openstreetmap.de/about.html ; max 1 request/sec, valid User-Agent, attribution and fix-map link.
- Public plaza origin reference: https://www.bucaramanga.gov.co/wp-content/uploads/2022/04/OATIC-I-TRIMESTRE-2022.-FINAL-rvWG.pdf ; 7.13488,-73.12438.
- Local HTTP stand-in: tests/road-matrix.test.ts. Real fetch exercised successful asymmetric matrix, HTTP503 and invalid negative matrix; no user/customer data used.
- Actual free provider check: public plaza to public city reference, outbound221.8s/return233.3s on 2026-11-20. Establishes endpoint response, not real delivery time or traffic.
- Postman CLI unavailable in this workspace; existing Node HTTP integration harness used without creating an external mock workspace.
- Geocoding not performed. Real locations require coordinates entered by client/admin. Demo markers are explicitly fictitious, not validated door locations.
- Route groups use geographic clustering, max5; exhaustive open path per group (<=120 alternatives). No claim of a global optimal fleet assignment. Provider failures fallback explicitly to geographic distance; no fabricated road ETA.
