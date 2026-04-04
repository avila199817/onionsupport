const TopbarViews = {

  facturas: () => `
    <div class="topbarview">

      <input 
        type="text"
        id="search-factura"
        placeholder="Buscar factura..."
      >

      <select id="filter-estado-factura">
        <option value="">Estado pago</option>
        <option value="pagada">Pagada</option>
        <option value="pendiente">Pendiente</option>
      </select>

      <button class="btn-primary">+ Nueva</button>

    </div>
  `

};
