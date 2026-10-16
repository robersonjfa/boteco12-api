# Início das inscrições da Mesa

Política definida pelo responsável pelo produto em 2026-10-16:

- Novas Mesas só podem iniciar inscrições hoje ou depois. O dia é determinado
  em `America/Sao_Paulo`, independentemente do fuso do cliente ou do servidor.
- Hoje é permitido mesmo quando o horário de início já passou.
- Na edição, o instante original pode permanecer inalterado, inclusive se
  histórico. Uma nova escolha deve ser hoje ou depois; mudar o horário de um
  dia histórico também constitui alteração.
- Agendamento `AT_START` continua exigindo um instante futuro. A exceção de
  edição não permite agendar publicação no passado.
- A política vale para todas as categorias e para dono e administrador.
  Permanecem as demais restrições de autorização, janela e estado da Mesa.

Exemplo: em `2026-10-16T02:30:00Z`, ainda é 15/10 em São Paulo.
`2026-10-15T03:00:00Z` é permitido; `2026-10-15T02:59:59Z` é do dia anterior.
Em `2026-10-16T03:00:00Z`, o dia permitido passa a ser 16/10.

O backend retorna HTTP 400 `mesa_start_date_in_past` para uma nova escolha
anterior a hoje. Os serviços de criação e edição aplicam a regra também para
chamadas internas. A edição compara com o instante persistido e inclui a data
lida no predicado de atualização, evitando usar uma exceção histórica obsoleta.
O frontend conserva o ISO original quando o dia exibido não foi alterado.

Sem backfill ou alteração de dados históricos. A política não afeta entradas
de participantes em Mesas já existentes nem a captura do placar inicial.
