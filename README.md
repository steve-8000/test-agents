# test-agents

에이전트 산출물 리뷰용 정적 사이트. clab-cluster에 ArgoCD GitOps로 배포되어 https://test.clab.one 에서 서빙된다.

## 구조

- `site/` — 서빙되는 정적 파일 (현재: Saegim 디자인 프로토타입, 다크/라이트 지원)
- `deploy/k8s/` — nginx Deployment / Service / Ingress(traefik + cert-manager)
- `kustomization.yaml` — `site/` 파일을 configMapGenerator로 ConfigMap화. 파일이 바뀌면 해시가 바뀌어 자동 롤아웃되므로 이미지 빌드 없이 push만으로 갱신된다.

## 갱신 방법

`site/` 파일을 수정하고 main에 push하면 ArgoCD(`test-agents` Application, automated sync)가 자동 반영한다.

## 주의

이 리포는 ArgoCD가 자격증명 없이 pull하도록 public이다. 민감정보(키, 토큰, 내부 주소)를 절대 커밋하지 않는다.
