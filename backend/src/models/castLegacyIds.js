const mongoose = require('mongoose');

module.exports = function castLegacyIdsPlugin(schema) {
  function castQuery() {
    const q = this.getQuery();

    function walk(obj) {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'string' && mongoose.Types.ObjectId.isValid(val)) {
          obj[key] = mongoose.Types.ObjectId(val);
        } else if (Array.isArray(val)) {
          obj[key] = val.map(v => (typeof v === 'string' && mongoose.Types.ObjectId.isValid(v) ? mongoose.Types.ObjectId(v) : v));
        } else if (val && typeof val === 'object') {
          walk(val);
        }
      }
    }
    walk(q);
  }

  ['find','findOne','findOneAndUpdate','findById','count','countDocuments','updateOne','updateMany','deleteOne','deleteMany'].forEach(hook => {
    schema.pre(hook, castQuery);
  });
};
