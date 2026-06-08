const express = require('express');
const router  = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_KEY   = process.env.ADMIN_KEY || 'raastkar_admin_2024';

let _db = null;
async function getDB() {
  if (_db) return _db;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  _db = client.db('raastkar');
  return _db;
}

// POST /api/loan/submit
router.post('/submit', async (req, res) => {
  try {
    const db  = await getDB();
    const app = {
      fullName:         req.body.fullName         || '',
      fatherName:       req.body.fatherName        || '',
      cnic:             req.body.cnic              || '',
      dob:              req.body.dob               || '',
      mobile:           req.body.mobile            || '',
      altMobile:        req.body.altMobile         || '',
      province:         req.body.province          || '',
      district:         req.body.district          || '',
      tehsil:           req.body.tehsil            || '',
      address:          req.body.address           || '',
      education:        req.body.education         || '',
      maritalStatus:    req.body.maritalStatus     || '',
      totalMembers:     Number(req.body.totalMembers)    || 0,
      earningMembers:   Number(req.body.earningMembers)  || 0,
      dependents:       Number(req.body.dependents)      || 0,
      farmIncome:       Number(req.body.farmIncome)      || 0,
      otherIncome:      Number(req.body.otherIncome)     || 0,
      familyIncome:     Number(req.body.familyIncome)    || 0,
      monthlyExpenses:  Number(req.body.monthlyExpenses) || 0,
      familyOccupation: req.body.familyOccupation  || '',
      workingAbroad:    req.body.workingAbroad      || '',
      existingLoan:     req.body.existingLoan       || 'no',
      existingLender:   req.body.existingLender     || '',
      existingEMI:      Number(req.body.existingEMI) || 0,
      landAcres:        Number(req.body.landAcres)   || 0,
      landOwnership:    req.body.landOwnership      || '',
      primaryCrop:      req.body.primaryCrop        || '',
      secondaryCrop:    req.body.secondaryCrop       || '',
      irrigation:       req.body.irrigation         || '',
      experience:       req.body.experience         || '',
      livestock:        req.body.livestock          || '',
      loanType:         req.body.loanType           || '',
      loanAmount:       Number(req.body.loanAmount) || 0,
      repaymentPeriod:  req.body.repaymentPeriod    || '',
      preferredBank:    req.body.preferredBank      || '',
      loanPurpose:      req.body.loanPurpose        || '',
      collateral:       req.body.collateral         || '',
      guarantor:        req.body.guarantor          || '',
      userId:           req.body.userId             || '',
      status:           'pending',
      adminNote:        '',
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    };
    await db.collection('loan_applications').insertOne(app);
    res.json({ success: true, message: 'Loan application submitted successfully!' });
  } catch (e) {
    console.error('loan submit error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/loan/admin/all
router.get('/admin/all', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const db   = await getDB();
    const apps = await db.collection('loan_applications')
      .find({}).sort({ created_at: -1 }).toArray();
    res.json({ success: true, applications: apps, total: apps.length });
  } catch (e) {
    console.error('loan admin/all error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/loan/admin/update-status
router.post('/admin/update-status', async (req, res) => {
  const { key, id, status, note } = req.body;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const db = await getDB();
    await db.collection('loan_applications').updateOne(
      { _id: new ObjectId(id) },
      { $set: {
        status:     status,
        adminNote:  note || '',
        updated_at: new Date().toISOString()
      }}
    );
    res.json({ success: true, message: 'Status updated to ' + status });
  } catch (e) {
    console.error('loan update-status error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;