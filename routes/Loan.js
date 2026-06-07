const express = require('express');
const router  = express.Router();
const { MongoClient } = require('mongodb');

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

// ── POST /api/loan/submit ── save loan application
router.post('/submit', async (req, res) => {
  try {
    const db  = await getDB();
    const app = {
      // Personal
      fullName:        req.body.fullName        || '',
      fatherName:      req.body.fatherName      || '',
      cnic:            req.body.cnic            || '',
      dob:             req.body.dob             || '',
      mobile:          req.body.mobile          || '',
      altMobile:       req.body.altMobile       || '',
      province:        req.body.province        || '',
      district:        req.body.district        || '',
      tehsil:          req.body.tehsil          || '',
      address:         req.body.address         || '',
      education:       req.body.education       || '',
      maritalStatus:   req.body.maritalStatus   || '',
      // Family & Income
      totalMembers:    req.body.totalMembers    || 0,
      earningMembers:  req.body.earningMembers  || 0,
      dependents:      req.body.dependents      || 0,
      farmIncome:      req.body.farmIncome      || 0,
      otherIncome:     req.body.otherIncome     || 0,
      familyIncome:    req.body.familyIncome    || 0,
      monthlyExpenses: req.body.monthlyExpenses || 0,
      familyOccupation:req.body.familyOccupation|| '',
      workingAbroad:   req.body.workingAbroad   || '',
      existingLoan:    req.body.existingLoan    || 'no',
      existingLender:  req.body.existingLender  || '',
      existingEMI:     req.body.existingEMI     || 0,
      // Farm
      landAcres:       req.body.landAcres       || 0,
      landOwnership:   req.body.landOwnership   || '',
      primaryCrop:     req.body.primaryCrop     || '',
      secondaryCrop:   req.body.secondaryCrop   || '',
      irrigation:      req.body.irrigation      || '',
      experience:      req.body.experience      || '',
      livestock:       req.body.livestock       || '',
      // Loan
      loanType:        req.body.loanType        || '',
      loanAmount:      req.body.loanAmount      || 0,
      repaymentPeriod: req.body.repaymentPeriod || '',
      preferredBank:   req.body.preferredBank   || '',
      loanPurpose:     req.body.loanPurpose     || '',
      collateral:      req.body.collateral      || '',
      guarantor:       req.body.guarantor       || '',
      // Meta
      userId:          req.body.userId          || '',
      status:          'pending',
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    };

    await db.collection('loan_applications').insertOne(app);
    res.json({ success: true, message: 'Loan application submitted successfully!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/loan/admin/all ── get all applications
router.get('/admin/all', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db   = await getDB();
    const apps = await db.collection('loan_applications')
      .find({}).sort({ created_at: -1 }).toArray();
    res.json({ success: true, applications: apps, total: apps.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/loan/admin/update-status ── approve / reject
router.post('/admin/update-status', async (req, res) => {
  const { key, id, status, note } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDB();
    const { ObjectId } = require('mongodb');
    await db.collection('loan_applications').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, adminNote: note || '', updated_at: new Date().toISOString() } }
    );
    res.json({ success: true, message: 'Status updated!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;