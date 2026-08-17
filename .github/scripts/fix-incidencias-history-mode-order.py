from pathlib import Path

p = Path('src/views/incidencias/index.js')
s = p.read_text(encoding='utf-8')

old = '''      syncAttributes(
        currentRoot,
        nextRoot
      );

      syncAttributes(
        currentPanel,
        nextPanel
      );

      syncAttributes(
        currentBody,
        nextBody
      );

      syncAttributes(
        currentComposer,
        nextComposer
      );

      syncDetailLoadingOverlay(
        currentRoot,
        nextRoot
      );

      const currentHistoryMode =
        cleanText(
          currentBody?.dataset?.historyMode,
          "ticket"
        );

      const nextHistoryMode =
        cleanText(
          nextBody?.dataset?.historyMode,
          "ticket"
        );
'''

new = '''      /*
         Leer el modo ANTES de sincronizar atributos: si copiamos primero
         data-history-mode del nextBody al currentBody perdemos precisamente
         la transición que debemos detectar.
      */
      const currentHistoryMode =
        cleanText(
          currentBody?.dataset?.historyMode,
          "ticket"
        );

      const nextHistoryMode =
        cleanText(
          nextBody?.dataset?.historyMode,
          "ticket"
        );

      syncAttributes(
        currentRoot,
        nextRoot
      );

      syncAttributes(
        currentPanel,
        nextPanel
      );

      syncAttributes(
        currentBody,
        nextBody
      );

      syncAttributes(
        currentComposer,
        nextComposer
      );

      syncDetailLoadingOverlay(
        currentRoot,
        nextRoot
      );
'''

count = s.count(old)
if count != 1:
    raise SystemExit(f'expected one history-mode ordering block, got {count}')

p.write_text(s.replace(old, new, 1), encoding='utf-8')
print('Fixed history-mode detection ordering')
